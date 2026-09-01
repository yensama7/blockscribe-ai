//! IPFS pinning via Kubo. Pinning failures do not kill the pipeline — the
//! repository must be genuinely useful with the distributed pieces switched
//! off (restructure.md §13, Phase 1 principle).

use reqwest::multipart::{Form, Part};
use serde_json::Value;
use std::env;
use std::time::Duration;

pub fn ipfs_api_url() -> String {
    env::var("IPFS_API_URL").unwrap_or_else(|_| "http://127.0.0.1:5001".to_string())
}

pub fn ipfs_gateway_url() -> String {
    env::var("IPFS_GATEWAY_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".to_string())
}

pub async fn pin_bytes(bytes: Vec<u8>, filename: &str) -> anyhow::Result<String> {
    let part = Part::bytes(bytes).file_name(filename.to_string());
    let form = Form::new().part("file", part);
    let resp_text = reqwest::Client::new()
        .post(format!("{}/api/v0/add?pin=true", ipfs_api_url()))
        .multipart(form)
        .timeout(Duration::from_secs(30))
        .send()
        .await?
        .text()
        .await?;
    let v: Value = serde_json::from_str(&resp_text)?;
    v.get("Hash")
        .and_then(|h| h.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow::anyhow!("ipfs response missing 'Hash': {resp_text}"))
}
