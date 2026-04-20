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
- Solana test validator
- Python vector service on `8001`
- Rust API on `5000`
- Frontend on `8080`

### Endpoints

- Frontend: http://127.0.0.1:8080
- Rust API health: http://127.0.0.1:5000/health
- Python FastAPI docs: http://127.0.0.1:8001/docs
- IPFS API/Web UI (local install defaults): http://127.0.0.1:5001/webui

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
- Configure developer wallet with env vars:
  - Frontend: `VITE_DEVELOPER_WALLET`
  - Backend: `DEVELOPER_WALLET`
