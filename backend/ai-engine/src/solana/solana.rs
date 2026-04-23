// solana.rs: utilities for uploading hash and cid to Solana via memo program
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{read_keypair_file, Keypair, Signer},
    transaction::Transaction,
};
use std::env;
use std::thread;
use std::time::Duration;

fn solana_rpc_url() -> String {
    env::var("SOLANA_RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".to_string())
}

fn load_signer() -> anyhow::Result<Keypair> {
    if let Ok(path) = env::var("SOLANA_KEYPAIR_PATH") {
        return read_keypair_file(path).map_err(|e| anyhow::anyhow!(e.to_string()));
    }

    if let Ok(home) = env::var("HOME") {
        let default = format!("{}/.config/solana/id.json", home);
        if let Ok(kp) = read_keypair_file(default) {
            return Ok(kp);
        }
    }

    Ok(Keypair::new())
}

// store hash+cid to Solana and return tx signature
pub fn send_memo(hash: &str, cid: &str) -> anyhow::Result<String> {
    let rpc_url = solana_rpc_url();
    let rpc = RpcClient::new(rpc_url.clone());

    let keypair = load_signer()?;
    println!("Solana RPC: {}", rpc_url);
    println!("Memo signer pubkey: {}", keypair.pubkey());

    // Best effort airdrop for localnet/devnet. If faucet fails, continue only if balance already exists.
    if let Err(err) = rpc.request_airdrop(&keypair.pubkey(), 1_000_000_000) {
        eprintln!("airdrop request failed: {}", err);
    }

    for _ in 0..20 {
        if let Ok(bal) = rpc.get_balance(&keypair.pubkey()) {
            if bal > 0 {
                break;
            }
        }
        thread::sleep(Duration::from_secs(1));
    }

    if rpc.get_balance(&keypair.pubkey())? == 0 {
        return Err(anyhow::anyhow!(
            "memo signer has 0 lamports; fund {} (or set SOLANA_KEYPAIR_PATH)",
            keypair.pubkey()
        ));
    }

    let memo_text = format!("book_hash:{};ipfs_cid:{}", hash, cid);

    let memo_ix = Instruction {
        program_id: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr".parse::<Pubkey>()?,
        accounts: vec![],
        data: memo_text.into_bytes(),
    };

    let recent_blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[memo_ix],
        Some(&keypair.pubkey()),
        &[&keypair],
        recent_blockhash,
    );

    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(sig.to_string())
}
