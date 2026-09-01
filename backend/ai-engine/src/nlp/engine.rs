//! Text extraction and academic metadata extraction.
//! Groq does the LLM work; a rule-based parser is the fallback so the
//! pipeline never dies with the AI switched off (restructure.md §6).

use anyhow::Context;
use dotenv::dotenv;
use pdf_extract::extract_text_from_mem;
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::env;
use std::path::Path;
use tokio::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AcademicMetadata {
    pub title: String,
    pub authors: String,
    pub abstract_text: String,
    pub discipline: String,
    pub keywords: String,
    pub language: String,
}

pub async fn compute_sha256_hex<P: AsRef<Path>>(path: P) -> anyhow::Result<String> {
    let bytes = fs::read(&path)
        .await
        .with_context(|| format!("reading file {:?}", path.as_ref()))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub fn sha256_hex_of(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

/// PDF text via pdf-extract; anything else is treated as UTF-8 text.
pub async fn extract_text(path: &str) -> anyhow::Result<String> {
    let bytes = fs::read(path).await.with_context(|| format!("reading {path}"))?;
    let is_pdf = bytes.starts_with(b"%PDF"); // content sniffing, not extension
    let text = if is_pdf {
        extract_text_from_mem(&bytes).unwrap_or_default()
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };
    Ok(text)
}

fn fallback_metadata(text: &str, filename: &str) -> AcademicMetadata {
    let title = text
        .lines()
        .map(str::trim)
        .find(|l| l.len() > 8 && l.len() < 200)
        .unwrap_or(filename)
        .to_string();

    let abstract_re = Regex::new(r"(?is)abstract\s*[:\n]\s*(.{50,1500}?)(\n\s*\n|introduction|$)").unwrap();
    let abstract_text = abstract_re
        .captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_else(|| text.split_whitespace().take(60).collect::<Vec<_>>().join(" "));

    AcademicMetadata {
        title,
        authors: String::new(),
        abstract_text,
        discipline: "General".to_string(),
        keywords: String::new(),
        language: "en".to_string(),
    }
}

/// Extract title, authors, abstract, discipline, keywords, language.
/// Falls back to the rule-based parser on any failure.
pub async fn extract_academic_metadata(text: &str, filename: &str) -> AcademicMetadata {
    dotenv().ok();
    let fallback = fallback_metadata(text, filename);
    let Ok(groq_key) = env::var("GROQ_API_KEY") else {
        return fallback;
    };
    let groq_base = env::var("GROQ_BASE")
        .unwrap_or_else(|_| "https://api.groq.com/openai/v1/chat/completions".to_string());
    let model = env::var("LLM_MODEL").unwrap_or_else(|_| "llama-3.3-70b-versatile".to_string());

    // first ~3000 words are plenty for front-matter metadata
    let excerpt: String = text.split_whitespace().take(3000).collect::<Vec<_>>().join(" ");

    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "You extract metadata from academic papers. Respond with only a JSON object with string fields: title, authors (comma separated), abstract, discipline, keywords (comma separated), language (ISO 639-1 code)."},
            {"role": "user", "content": format!("Extract the metadata from this paper text:\n\n{excerpt}")}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    });

    let response = Client::new()
        .post(groq_base)
        .bearer_auth(groq_key)
        .json(&body)
        .send()
        .await;

    let parsed: Option<Value> = match response {
        Ok(resp) if resp.status().is_success() => resp
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| {
                v["choices"][0]["message"]["content"]
                    .as_str()
                    .map(|s| s.trim().trim_start_matches("```json").trim_matches('`').to_string())
            })
            .and_then(|content| serde_json::from_str(&content).ok()),
        _ => None,
    };

    let Some(meta) = parsed else { return fallback };
    let get = |key: &str, alt: &str| {
        meta.get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| alt.to_string())
    };

    AcademicMetadata {
        title: get("title", &fallback.title),
        authors: get("authors", ""),
        abstract_text: get("abstract", &fallback.abstract_text),
        discipline: get("discipline", "General"),
        keywords: get("keywords", ""),
        language: get("language", "en"),
    }
}
