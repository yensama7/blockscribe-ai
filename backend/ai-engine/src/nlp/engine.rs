use serde_json::{json, Value};
use serde::Serialize;
use serde::Deserialize;
use tokio;
use reqwest::Client;
use pdf_extract::extract_text_from_mem;
use regex::Regex;
use anyhow::{anyhow, Context};
use reqwest::multipart::{Form, Part};
use sha2::{Digest, Sha256};
use std::env;
use std::path::Path;
use tokio::fs;
use dotenv::dotenv;


// most important functions
pub async fn get_meta_data_response(file_path: String) -> anyhow::Result<ExtractedMetaData>{
    let bytes = fs::read(file_path).await.unwrap();
    let extracted_txt = extract_text_from_mem(&bytes).unwrap();


    // load the dotenv variables
    dotenv().ok();

    // groq api setup
    let groq_base = env::var("GROQ_BASE").unwrap_or_else(|_| "https://api.groq.com/openai/v1/chat/completions".to_string());
    let groq_key = env::var("GROQ_API_KEY").context("GROQ_API_KEY not set in environment variables; \n add it to your .env file".to_string())?;

    let client = Client::new();

    // json format request to the ai with the ai model
    let body = json!({
        "model": "openai/gpt-oss-120b", // shows th model used
        "messages": [
             {
      "role": "system",
      "content": "You are an assistant that extracts structured metadata from documents.",
    },
            {
                "role": "user",
                "content":format!(
                    "From the following text, extract:\n\
                     - Genre\n\
                     - Summary (with optimal keywords)\n\
                     - Difficulty level (Beginner/Intermediate/Advanced)\n\
                     - Title\n\n\
                     - Keywords\n\n\
                     Text:\n{}",
                    extracted_txt
                )
            }
        ],
        "include_reasoning": false, // abstracts the thinking process
        "temperature": 0.6 // lower values make the answers concise, recommended 0.5 - 0.7
    });

    // sends the request using reqwest
    let resp = client
        .post(groq_base)
        .bearer_auth(groq_key)
        .json(&body)
        .send()
        .await?;


    let json = resp.text().await?;

    // Extract the message
    let re = Regex::new(
        r#"(?s)\*\*Genre:\*\*\s*(.*?)\s+.*?\*\*Title:\*\*\s*(.*?)\s+.*?\*\*Difficulty\s*Level:\*\*\s*(.*?)\s+.*?\*\*Summary.*?:\*\*\s*(.*?)""#
    ).unwrap();

    // prep the ExtractedMetaData struct, if returned then we didn't fetch anything
    let mut metadata = ExtractedMetaData{
        genre: "".to_string(),
        title: "".to_string(),
        difficulty: "".to_string(),
        summary: "".to_string(),
    };

    if let Some(caps) = re.captures(&json) {
        let genre = caps.get(1).unwrap().as_str().trim();
        let title = caps.get(2).unwrap().as_str().trim();
        let difficulty = caps.get(3).unwrap().as_str().trim();
        let summary = caps.get(4).unwrap().as_str().trim();

        println!("Genre: {}", genre);
        println!("Title: {}", title);
        println!("Difficulty: {}", difficulty);
        println!("Summary: {}", summary);

        metadata = ExtractedMetaData{title: title.to_string(),
                                    difficulty: difficulty.to_string(),
                                    summary: summary.to_string(),
                                    genre: genre.to_string(),
                                    };

    }

    Ok(metadata)
    // let record = package_hash_and_cid(pdf_path).await?;
    // println!("FileRecord: {:?}", record);


}

pub async fn package_hash_and_cid<P: AsRef<Path>>(
    path: P,
) -> anyhow::Result<FileRecord> {
    // first: compute the hash
    let file_hash = compute_sha256_hex(&path).await?;

    // second: upload and obtain CID
    let file_cid = upload_file_to_ipfs_kubo(&path).await?;

    // package and return
    Ok(FileRecord { file_hash, file_cid })
}



// structs to return
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExtractedMetaData {
    pub title: String,
    pub difficulty: String,     // Beginner | intermediate | Advanced etc... yada yada yada; suck your mum
    pub genre: String,
    pub summary: String,

    // resource_type: String,  // Lecture note, text book, research paper slides etc
    // keywords: Vec<String>,  // is it really possible to not have any keywords LMAO
    // topics: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub file_hash: String, // SHA-256 hex of file bytes
    pub file_cid: String,  // IPFS CID returned by the daemon
}


// helper functions
pub async fn compute_sha256_hex<P: AsRef<Path>>(path: P) -> anyhow::Result<String> {
    // read file bytes asynchronously
    let bytes = fs::read(&path)
        .await
        .with_context(|| format!("reading file {:?}", path.as_ref()))?;

    // compute SHA-256
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let digest = hasher.finalize();

    // return hex string
    Ok(hex::encode(digest))
}

async fn upload_file_to_ipfs_kubo<P: AsRef<Path>>(path: P) -> anyhow::Result<String> {
    // read file bytes
    let bytes = fs::read(&path).await?;
    let filename = path
        .as_ref()
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("file")
        .to_string();

    // build multipart form
    let part = Part::bytes(bytes).file_name(filename);
    let form = Form::new().part("file", part);

    // send request to local ipfs daemon
    let resp_text = Client::new()
        .post("http://127.0.0.1:5001/api/v0/add")
        .multipart(form)
        .send()
        .await?
        .text()
        .await?;

    // parse JSON and return "Hash"
    let v: Value = serde_json::from_str(&resp_text)?;
    let cid = v
        .get("Hash")
        .and_then(|h| h.as_str())
        .ok_or_else(|| anyhow!("ipfs response missing 'Hash' field"))?;
    Ok(cid.to_string())
}
