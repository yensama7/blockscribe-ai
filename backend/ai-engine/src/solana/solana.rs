// solana.rs: This file defines all the utilties for uploading the hash and the cid to the solana blockchain
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    signature::{ Signer, Keypair},
    transaction::Transaction,
    pubkey::Pubkey,
    instruction::Instruction,

};
use std::thread;
use std::time::Duration;


// store hash+cid to Solana returns the transaction signature
pub fn send_memo(hash: &str, cid: &str) -> anyhow::Result<String> {
    // 1. Connect to cluster (devnet for testing)
    let rpc = RpcClient::new("http://localhost:8899".to_string());

    // 2. creates a new key pair, for testing purposes airdrops some sol in it
    let keypair = Keypair::new();
    println!("Pubkey: {}", keypair.pubkey());


    println!("Requesting airdrop...");

    // Poll until the account actually has lamports
    for _ in 0..20 {
        rpc.request_airdrop(&keypair.pubkey(), 1_000_000_000)?;
        if let Ok(bal) = rpc.get_balance(&keypair.pubkey()) {
            if bal > 0 {
                println!("Airdrop confirmed: {} lamports", bal);
                break;
            }
        }
        thread::sleep(Duration::from_secs(2));
    }



    // 3. Compose memo text
    let memo_text = format!("book_hash:{};ipfs_cid:{}", hash, cid);

    // 4. Build memo instruction
    let memo_ix = Instruction {
        program_id: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
            .parse::<Pubkey>()?,
        accounts: vec![],
        data: memo_text.into_bytes(),
    };

    // 5. Create & sign transaction
    let recent_blockhash = rpc.get_latest_blockhash()?;
    let tx = Transaction::new_signed_with_payer(
        &[memo_ix],
        Some(&keypair.pubkey()),
        &[&keypair],
        recent_blockhash,
    );

    // 6. Send
    let sig = rpc.send_and_confirm_transaction(&tx)?;
    Ok(sig.to_string()) // returns the transaction signature
}