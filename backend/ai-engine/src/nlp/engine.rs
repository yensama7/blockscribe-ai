use anyhow::{anyhow, Context};
use dotenv::dotenv;
use pdf_extract::extract_text_from_mem;
use regex::Regex;
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::env;
use std::path::Path;
use tokio::fs;

fn fallback_metadata_from_path(file_path: &str) -> ExtractedMetaData {
    let file_name = Path::new(file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled document")
        .to_string();

    ExtractedMetaData {
        title: file_name,
        difficulty: "Unknown".to_string(),
        genre: "General".to_string(),
        summary: "Metadata extraction fallback used because AI extraction is unavailable.".to_string(),
    }
}

pub async fn get_meta_data_response(file_path: String) -> anyhow::Result<ExtractedMetaData> {
    let bytes = fs::read(&file_path)
        .await
        .with_context(|| format!("failed to read file: {file_path}"))?;

    let extracted_txt = extract_text_from_mem(&bytes)
        .unwrap_or_else(|_| "Unable to extract text from file; using fallback metadata.".to_string());

    dotenv().ok();

    let groq_base = env::var("GROQ_BASE")
        .unwrap_or_else(|_| "https://api.groq.com/openai/v1/chat/completions".to_string());
    let groq_key = match env::var("GROQ_API_KEY") {
        Ok(key) => key,
        Err(_) => return Ok(fallback_metadata_from_path(&file_path)),
    };

    let body = json!({
        "model": "openai/gpt-oss-120b",
        "messages": [
            {
                "role": "system",
                "content": "You are an assistant that extracts structured metadata from documents. Return markdown fields for Genre, Title, Difficulty Level, and Summary."
            },
            {
                "role": "user",
                "content": format!(
                    "From the following text, extract:\n- Genre\n- Summary\n- Difficulty level (Beginner/Intermediate/Advanced)\n- Title\n\nText:\n{}",
                    extracted_txt
                )
            }
        ],
        "include_reasoning": false,
        "temperature": 0.3
    });

    let response = Client::new()
        .post(groq_base)
        .bearer_auth(groq_key)
        .json(&body)
        .send()
        .await;

    let response_text = match response {
        Ok(resp) if resp.status().is_success() => resp.text().await.unwrap_or_default(),
        _ => return Ok(fallback_metadata_from_path(&file_path)),
    };

    let re = Regex::new(
        r"(?s)\*\*Genre:\*\*\s*(.*?)\s+.*?\*\*Title:\*\*\s*(.*?)\s+.*?\*\*Difficulty\s*Level:\*\*\s*(.*?)\s+.*?\*\*Summary.*?:\*\*\s*(.*?)$",
    )
    .map_err(|e| anyhow!("regex initialization error: {e}"))?;

    if let Some(caps) = re.captures(&response_text) {
        return Ok(ExtractedMetaData {
            genre: caps
                .get(1)
                .map(|v| v.as_str().trim().to_string())
                .unwrap_or_else(|| "General".to_string()),
            title: caps
                .get(2)
                .map(|v| v.as_str().trim().to_string())
                .unwrap_or_else(|| "Untitled document".to_string()),
            difficulty: caps
                .get(3)
                .map(|v| v.as_str().trim().to_string())
                .unwrap_or_else(|| "Unknown".to_string()),
            summary: caps
                .get(4)
                .map(|v| v.as_str().trim().to_string())
                .unwrap_or_else(|| "No summary generated.".to_string()),
        });
    }

    Ok(fallback_metadata_from_path(&file_path))
}

pub async fn package_hash_and_cid<P: AsRef<Path>>(path: P) -> anyhow::Result<FileRecord> {
    let file_hash = compute_sha256_hex(&path).await?;
    let file_cid = upload_file_to_ipfs_kubo(&path).await?;

    Ok(FileRecord { file_hash, file_cid })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractedMetaData {
    pub title: String,
    pub difficulty: String,
    pub genre: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub file_hash: String,
    pub file_cid: String,
}

pub async fn compute_sha256_hex<P: AsRef<Path>>(path: P) -> anyhow::Result<String> {
    let bytes = fs::read(&path)
        .await
        .with_context(|| format!("reading file {:?}", path.as_ref()))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hasher.finalize();

    Ok(hex::encode(digest))
}

async fn upload_file_to_ipfs_kubo<P: AsRef<Path>>(path: P) -> anyhow::Result<String> {
    dotenv().ok();
    let bytes = fs::read(&path).await?;
    let filename = path
        .as_ref()
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    let part = Part::bytes(bytes).file_name(filename);
    let form = Form::new().part("file", part);

    let ipfs_api_url = env::var("IPFS_API_URL")
        .unwrap_or_else(|_| "http://ipfs:5001".to_string());
    let ipfs_add_url = format!(
        "{}/api/v0/add",
        ipfs_api_url.trim_end_matches('/')
    );

    let resp_text = Client::new()
        .post(&ipfs_add_url)
        .multipart(form)
        .send()
        .await?
        .text()
        .await?;

    let v: Value = serde_json::from_str(&resp_text)?;
    let cid = v
        .get("Hash")
        .and_then(|h| h.as_str())
        .ok_or_else(|| anyhow!("ipfs response missing 'Hash' field"))?;
    Ok(cid.to_string())
}
