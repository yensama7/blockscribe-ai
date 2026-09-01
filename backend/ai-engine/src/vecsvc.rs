//! Client for the Python vector service. Every call is best-effort: the
//! vector index is a cache, not a source of truth (restructure.md §5).

use serde_json::{Value, json};
use std::env;
use std::time::Duration;

pub fn base_url() -> String {
    env::var("PYTHON_ENGINE_URL").unwrap_or_else(|_| "http://127.0.0.1:8001".to_string())
}

async fn post(path: &str, body: Value) -> anyhow::Result<Value> {
    let resp = reqwest::Client::new()
        .post(format!("{}{}", base_url(), path))
        .json(&body)
        .timeout(Duration::from_secs(120))
        .send()
        .await?;
    if !resp.status().is_success() {
        anyhow::bail!("vector service {} returned {}", path, resp.status());
    }
    Ok(resp.json().await?)
}

#[allow(clippy::too_many_arguments)]
pub async fn ingest(
    version_id: &str,
    submission_id: &str,
    uploader_id: &str,
    institution_id: &str,
    text: &str,
    title: &str,
    discipline: &str,
    language: &str,
) -> anyhow::Result<Value> {
    post(
        "/ingest",
        json!({
            "version_id": version_id,
            "submission_id": submission_id,
            "uploader_id": uploader_id,
            "institution_id": institution_id,
            "text": text,
            "title": title,
            "discipline": discipline,
            "language": language,
            "year": chrono::Utc::now().format("%Y").to_string().parse::<i32>().unwrap_or(0),
        }),
    )
    .await
}

pub async fn similarity(submission_id: &str, uploader_id: &str, text: &str) -> anyhow::Result<Value> {
    let threshold: f64 = env::var("SIMILARITY_THRESHOLD")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.82);
    post(
        "/similarity",
        json!({"submission_id": submission_id, "uploader_id": uploader_id, "text": text, "threshold": threshold}),
    )
    .await
}

pub async fn search(query: &str, k: usize) -> anyhow::Result<Value> {
    post("/search", json!({"query": query, "k": k})).await
}

pub async fn related(abstract_text: &str, submission_id: &str) -> anyhow::Result<Value> {
    post("/related", json!({"abstract": abstract_text, "submission_id": submission_id})).await
}

pub async fn match_reviewers(abstract_text: &str, exclude_user_ids: Vec<String>) -> anyhow::Result<Value> {
    post(
        "/reviewers/match",
        json!({"abstract": abstract_text, "exclude_user_ids": exclude_user_ids}),
    )
    .await
}

pub async fn set_status(version_id: &str, status: &str) -> anyhow::Result<Value> {
    post("/status", json!({"version_id": version_id, "payload": {"status": status}})).await
}

pub async fn rebuild(records: Vec<Value>) -> anyhow::Result<Value> {
    post("/rebuild", json!({"records": records})).await
}
