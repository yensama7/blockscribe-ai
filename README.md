# Blockscribe AI

Blockscribe AI is a document library with blockchain anchoring.

It has three main runtime components:

- **Rust Actix server** (`backend/ai-engine/src/bin/main.rs`)  
  Upload flow, metadata persistence, integrity endpoints, and Solana memo anchoring.
- **Python FastAPI vector service** (`backend/ai-engine/src/vectored/vector_service.py`)  
  Analytics and vector-search endpoints.
- **React/Vite frontend** (`src/`)  
  Wallet-gated UI for upload/download/integrity verification.

## What the app is expected to do

- Users can navigate without a wallet.
- Any document action (upload, integrity check, download) requires a connected Solana wallet.
- Upload flow:
  1. File is uploaded to IPFS Kubo.
  2. SHA-256 hash + CID are anchored on Solana memo.
  3. Record is stored in SQLite with uploader wallet.
- Integrity flow:
  - User uploads a document to check whether its hash exists in stored/on-chain anchored records.
- Download flow:
  - Backend returns a fee-split plan (uploader reimbursement + developer cut) before download.

## Prerequisites

Install locally before running scripts:

- Node.js + npm
- Python 3.10+
- Rust (stable toolchain)
- IPFS Kubo CLI (`ipfs`)
- Solana CLI (`solana`, `solana-test-validator`)

> `backend/install.sh` can help bootstrap dependencies, but review it first because it uses `sudo apt-get`.

## Quick start (recommended)

From repo root:

```bash
cd backend
chmod +x run_server.sh
./run_server.sh
```

This starts:

- IPFS daemon
- Solana test validator (only for local validator mode)
- Python vector service on `8001`
- Rust API on `5000`
- Frontend on `8080`

### Endpoints

- Frontend: http://127.0.0.1:8080
- Rust API health: http://127.0.0.1:5000/health
- Python FastAPI docs: http://127.0.0.1:8001/docs
- IPFS API/Web UI (local install defaults): http://127.0.0.1:5001/webui


<<<<<<< codex/implement-solana-wallet-integration-and-file-handling-g41a02
## Devnet mode (optional for Solana integration testing)

The backend memo writer defaults to devnet if `SOLANA_RPC_URL` is not set, but `run_server.sh` defaults `SOLANA_RPC_URL` to local validator (`http://127.0.0.1:8899`) so local full-stack startup works out of the box.
=======
## Devnet mode (recommended for Solana integration testing)

By default, backend memo writes now use `SOLANA_RPC_URL` and fall back to `https://api.devnet.solana.com`.
>>>>>>> main

Run with devnet:

```bash
export SOLANA_RPC_URL=https://api.devnet.solana.com
# optional: signer used for memo txs (defaults to ~/.config/solana/id.json)
export SOLANA_KEYPAIR_PATH=$HOME/.config/solana/id.json

cd backend
./run_server.sh
```

If `SOLANA_RPC_URL` points to `http://localhost:8899`, `run_server.sh` will start `solana-test-validator`. Otherwise it will use the external RPC and skip local validator startup.

## Manual run (if you prefer)

Open separate terminals and run:

```bash
# 1) vector service
cd backend/ai-engine
python3 -m venv .venv
source .venv/bin/activate
pip install -r src/vectored/requirements.txt
python src/vectored/vector_service.py
```

```bash
# 2) rust api
cargo run --manifest-path backend/ai-engine/cargo.toml
```

```bash
# 3) frontend
npm install
npm run dev -- --host 0.0.0.0 --port 8080
```

## Notes / current implementation caveats

- Rust currently binds to `127.0.0.1:5000`.
- Cargo manifest file is named `cargo.toml` (lowercase) in this repo, so commands use `--manifest-path backend/ai-engine/cargo.toml`.
- Configure runtime env vars:
  - Solana RPC: `SOLANA_RPC_URL` (default: `https://api.devnet.solana.com`)
  - Solana signer keypair: `SOLANA_KEYPAIR_PATH` (default: `~/.config/solana/id.json`)
  - Frontend developer wallet: `VITE_DEVELOPER_WALLET`
  - Backend developer wallet: `DEVELOPER_WALLET`
