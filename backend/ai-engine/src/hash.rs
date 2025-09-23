use sha2::{Sha256, Digest};
use std::path::Path;
use tokio::fs;
use anyhow::{anyhow, Context};


// basic hash function
pub fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = sha2::Sha256::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    format!("{:x}", result)
}

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
