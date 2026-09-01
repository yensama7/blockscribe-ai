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
/// Content sniffing (magic bytes), never the file extension.
pub fn extract_text_from_bytes(bytes: &[u8]) -> String {
    if bytes.starts_with(b"%PDF") {
        extract_text_from_mem(bytes).unwrap_or_default()
    } else {
        String::from_utf8_lossy(bytes).to_string()
    }
}

pub async fn extract_text(path: &str) -> anyhow::Result<String> {
    let bytes = fs::read(path).await.with_context(|| format!("reading {path}"))?;
    Ok(extract_text_from_bytes(&bytes))
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
    // gpt-oss-20b is ~2x faster than 120b and just as good at structured
    // front-matter extraction; override with LLM_MODEL for richer summaries.
    let model = env::var("LLM_MODEL").unwrap_or_else(|_| "openai/gpt-oss-20b".to_string());

    // Title, authors, abstract and keywords all live in the front matter, so
    // ~1200 words is plenty and keeps the LLM call fast.
    let excerpt: String = text.split_whitespace().take(1200).collect::<Vec<_>>().join(" ");

    // temperature 0 + fixed seed => the same paper yields the same metadata on
    // every deposit, so re-processing a document is deterministic.
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "You extract bibliographic metadata from academic papers. Respond with ONLY a JSON object with these exact string fields: title, authors (comma separated, in document order), abstract (verbatim from the paper, or a one-sentence summary if none is present), discipline (a single broad field such as \"Public Health\" or \"Computer Science\"), keywords (comma separated, 3-6 terms), language (ISO 639-1 code). Do not invent authors or data. Use the empty string for any field you cannot determine."},
            {"role": "user", "content": format!("Extract the metadata from this paper text:\n\n{excerpt}")}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
        "top_p": 1,
        "seed": 42
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
    // The model returns comma-separated strings most of the time, but
    // occasionally an array (esp. authors/keywords) — coerce either to a
    // clean comma-joined string so no field silently drops.
    let get = |key: &str, alt: &str| {
        let value = match meta.get(key) {
            Some(Value::String(s)) => s.trim().to_string(),
            Some(Value::Array(items)) => items
                .iter()
                .filter_map(|v| v.as_str().map(str::trim).filter(|s| !s.is_empty()))
                .collect::<Vec<_>>()
                .join(", "),
            _ => String::new(),
        };
        if value.is_empty() { alt.to_string() } else { value }
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
