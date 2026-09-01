//! Solana anchoring, signed server-side by the institution fee payer.
//! Users never pay and never see a wallet (restructure.md §3, §4, §15).
//!
//! ponytail: transactions are hand-rolled (one memo instruction, legacy
//! format) instead of pulling in solana-sdk — swap to the real SDK when the
//! Anchor program in chain/document-registry is deployed.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::env;
use std::path::Path;
use std::time::Duration;

pub const MEMO_PROGRAM_ID: &str = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
/// Program id declared in chain/document-registry/src/lib.rs. PDA addresses
/// are derived against it today so records carry their future on-chain
/// address even before the program is deployed.
pub const DOCUMENT_REGISTRY_ID: &str = "BScrbReg1stry1111111111111111111111111111111";

pub fn rpc_url() -> String {
    env::var("SOLANA_RPC_URL").unwrap_or_else(|_| "http://127.0.0.1:8899".to_string())
}

// ---------- keys ----------

/// Load the fee-payer keypair from SOLANA_KEYPAIR_PATH (solana id.json
/// format: 64-byte array), else create and persist ./fee_payer.json.
/// ponytail: file-based keys are a dev affordance — production uses KMS/HSM.
pub fn load_fee_payer() -> anyhow::Result<SigningKey> {
    let path = env::var("SOLANA_KEYPAIR_PATH").unwrap_or_else(|_| "fee_payer.json".to_string());
    if Path::new(&path).exists() {
        let raw = std::fs::read_to_string(&path)?;
        let bytes: Vec<u8> = serde_json::from_str(&raw)?;
        let secret: [u8; 32] = bytes
            .get(..32)
            .ok_or_else(|| anyhow::anyhow!("keypair file too short"))?
            .try_into()?;
        return Ok(SigningKey::from_bytes(&secret));
    }
    let key = SigningKey::generate(&mut rand::rngs::OsRng);
    let mut full = key.to_bytes().to_vec();
    full.extend_from_slice(key.verifying_key().as_bytes());
    std::fs::write(&path, serde_json::to_string(&full)?)?;
    Ok(key)
}

pub fn generate_custodial_keypair() -> (String, Vec<u8>) {
    let key = SigningKey::generate(&mut rand::rngs::OsRng);
    let pubkey = bs58::encode(key.verifying_key().as_bytes()).into_string();
    // ponytail: secret stored raw in Postgres for the demo; encrypt with a
    // KMS-backed key before any real deployment (restructure.md §4)
    (pubkey, key.to_bytes().to_vec())
}

pub fn sign_with_secret(secret: &[u8], message: &[u8]) -> anyhow::Result<String> {
    let secret: [u8; 32] = secret
        .get(..32)
        .ok_or_else(|| anyhow::anyhow!("bad secret length"))?
        .try_into()?;
    let key = SigningKey::from_bytes(&secret);
    Ok(bs58::encode(key.sign(message).to_bytes()).into_string())
}

// ---------- PDA derivation (restructure.md §3) ----------

fn is_on_curve(bytes: &[u8; 32]) -> bool {
    curve25519_dalek::edwards::CompressedEdwardsY(*bytes)
        .decompress()
        .is_some()
}

/// find_program_address(["doc", sha256(file)], DOCUMENT_REGISTRY_ID).
/// Given only the file, anyone can derive this address and read the record —
/// no database in the trust path.
pub fn derive_document_pda(file_hash_hex: &str) -> anyhow::Result<(String, u8)> {
    let hash_bytes = hex::decode(file_hash_hex)?;
    let program_id = bs58::decode(DOCUMENT_REGISTRY_ID).into_vec()?;
    for bump in (0..=255u8).rev() {
        let mut hasher = Sha256::new();
        hasher.update(b"doc");
        hasher.update(&hash_bytes);
        hasher.update([bump]);
        hasher.update(&program_id);
        hasher.update(b"ProgramDerivedAddress");
        let candidate: [u8; 32] = hasher.finalize().into();
        if !is_on_curve(&candidate) {
            return Ok((bs58::encode(candidate).into_string(), bump));
        }
    }
    anyhow::bail!("no valid PDA bump found")
}

// ---------- transaction wire format ----------

fn compact_u16(n: usize, out: &mut Vec<u8>) {
    let mut rem = n;
    loop {
        let mut byte = (rem & 0x7f) as u8;
        rem >>= 7;
        if rem != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if rem == 0 {
            break;
        }
    }
}

fn build_memo_tx(payer: &SigningKey, blockhash: &[u8; 32], memo: &[u8]) -> Vec<u8> {
    let memo_program = bs58::decode(MEMO_PROGRAM_ID).into_vec().expect("static id");

    let mut msg: Vec<u8> = vec![1, 0, 1]; // 1 signer, 0 ro-signed, 1 ro-unsigned
    compact_u16(2, &mut msg);
    msg.extend_from_slice(payer.verifying_key().as_bytes());
    msg.extend_from_slice(&memo_program);
    msg.extend_from_slice(blockhash);
    compact_u16(1, &mut msg); // one instruction
    msg.push(1); // program id index
    compact_u16(0, &mut msg); // no accounts
    compact_u16(memo.len(), &mut msg);
    msg.extend_from_slice(memo);

    let signature = payer.sign(&msg);
    let mut tx = Vec::new();
    compact_u16(1, &mut tx);
    tx.extend_from_slice(&signature.to_bytes());
    tx.extend_from_slice(&msg);
    tx
}

// ---------- RPC ----------

async fn rpc_call(client: &reqwest::Client, method: &str, params: Value) -> anyhow::Result<Value> {
    let resp: Value = client
        .post(rpc_url())
        .json(&json!({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}))
        .timeout(Duration::from_secs(10))
        .send()
        .await?
        .json()
        .await?;
    if let Some(err) = resp.get("error") {
        anyhow::bail!("rpc {} failed: {}", method, err);
    }
    Ok(resp["result"].clone())
}

pub struct AnchorResult {
    pub signature: String,
    pub slot: i64,
}

/// Send a memo transaction anchoring `memo_json` and wait for confirmation.
/// Airdrops on localnet if the fee payer is empty. Returns Err when the chain
/// is unreachable — callers record the anchor as pending, never as confirmed
/// (restructure.md §15: an unconfirmed anchor row is a lie in your database).
pub async fn anchor_memo(payer: &SigningKey, memo_json: &Value) -> anyhow::Result<AnchorResult> {
    let client = reqwest::Client::new();
    let payer_b58 = bs58::encode(payer.verifying_key().as_bytes()).into_string();

    let balance = rpc_call(&client, "getBalance", json!([payer_b58]))
        .await?
        .get("value")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if balance < 100_000 {
        // best-effort faucet (works on solana-test-validator and devnet)
        let _ = rpc_call(&client, "requestAirdrop", json!([payer_b58, 1_000_000_000u64])).await;
        tokio::time::sleep(Duration::from_millis(1500)).await;
    }

    let bh = rpc_call(
        &client,
        "getLatestBlockhash",
        json!([{"commitment": "confirmed"}]),
    )
    .await?;
    let blockhash_str = bh["value"]["blockhash"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("no blockhash in rpc response"))?;
    let blockhash: [u8; 32] = bs58::decode(blockhash_str)
        .into_vec()?
        .try_into()
        .map_err(|_| anyhow::anyhow!("bad blockhash length"))?;

    let memo = serde_json::to_vec(memo_json)?;
    let tx = build_memo_tx(payer, &blockhash, &memo);
    let sig = rpc_call(
        &client,
        "sendTransaction",
        json!([B64.encode(&tx), {"encoding": "base64", "preflightCommitment": "confirmed"}]),
    )
    .await?
    .as_str()
    .ok_or_else(|| anyhow::anyhow!("no signature returned"))?
    .to_string();

    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let status = rpc_call(&client, "getSignatureStatuses", json!([[sig]])).await?;
        if let Some(s) = status["value"][0].as_object() {
            if s.get("err").map(|e| !e.is_null()).unwrap_or(false) {
                anyhow::bail!("transaction failed on chain: {:?}", s["err"]);
            }
            let confirmed = s
                .get("confirmationStatus")
                .and_then(|c| c.as_str())
                .map(|c| c == "confirmed" || c == "finalized")
                .unwrap_or(false);
            if confirmed {
                return Ok(AnchorResult {
                    signature: sig,
                    slot: s.get("slot").and_then(|v| v.as_i64()).unwrap_or(0),
                });
            }
        }
    }
    anyhow::bail!("transaction {} not confirmed in time", sig)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compact_u16_matches_shortvec_spec() {
        let mut v = Vec::new();
        compact_u16(0, &mut v);
        assert_eq!(v, [0]);
        v.clear();
        compact_u16(127, &mut v);
        assert_eq!(v, [0x7f]);
        v.clear();
        compact_u16(128, &mut v);
        assert_eq!(v, [0x80, 0x01]);
        v.clear();
        compact_u16(300, &mut v);
        assert_eq!(v, [0xac, 0x02]);
    }

    #[test]
    fn pda_is_deterministic_and_off_curve() {
        let hash = "a".repeat(64);
        let (addr1, bump1) = derive_document_pda(&hash).unwrap();
        let (addr2, bump2) = derive_document_pda(&hash).unwrap();
        assert_eq!(addr1, addr2);
        assert_eq!(bump1, bump2);
        let bytes: [u8; 32] = bs58::decode(&addr1).into_vec().unwrap().try_into().unwrap();
        assert!(!is_on_curve(&bytes));
    }
}
