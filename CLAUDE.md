# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend**
```bash
npm run dev          # dev server on :8081 (or FRONTEND_PORT)
npm run build        # production build
npm run lint         # eslint
```

**Full stack (recommended)**
```bash
cd backend && ./run_server.sh
# Starts: IPFS daemon, solana-test-validator, Python :8001, Rust :5000, frontend :8081
```

**Rust backend only**
```bash
cargo run --manifest-path backend/ai-engine/Cargo.toml
```

**Python vector service only**
```bash
cd backend/ai-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r src/vectored/requirements.txt
python src/vectored/vector_service.py
```

## Architecture

Three runtime components talk to each other:

| Component | Location | Port | Role |
|-----------|----------|------|------|
| React/Vite frontend | `src/` | 8081 | Wallet-gated UI |
| Rust Actix server | `backend/ai-engine/src/bin/main.rs` | 5000 | Upload, metadata, integrity, Solana anchoring |
| Python FastAPI | `backend/ai-engine/src/vectored/` | 8001 | Vector search and analytics |

Storage: SQLite (`archive.db` at repo root of the backend process), IPFS (via Kubo), Solana memo program for on-chain anchoring.

### Frontend data flow

- **`src/services/api.ts`** — all API calls to the Rust backend at `http://127.0.0.1:5000`. The `/metadata` endpoint returns positional `string[][]` rows (not objects); `normalizeMetadataRows()` maps them to `ArchiveRecord`.
- **`src/context/WalletContext.tsx`** — detects `window.solana` providers directly (Phantom, Backpack, Solflare, etc.) with no external wallet-adapter library.
- **`src/lib/solanaTransactions.ts`** — expects `window.solanaWeb3` to be loaded globally (CDN). Provides `sendMemoTransaction` (upload anchoring) and `sendFeeSplitTransfer` (download fee).

### Upload flow (two-step)
1. `POST /api/upload` with file + wallet → backend pins to IPFS, extracts metadata via NLP, returns `file_hash` + pending record.
2. Frontend calls `sendMemoTransaction` to anchor hash on Solana.
3. `POST /api/upload/confirm-signature` with hash + signature to finalize the record.

### Download flow
1. `POST /download/settle-fee` → returns `DownloadFeePlan` (lamports split between uploader and developer).
2. Frontend calls `sendFeeSplitTransfer` to sign and broadcast the fee split.

### Key env vars
| Var | Used by | Default |
|-----|---------|---------|
| `SOLANA_RPC_URL` | Rust backend | `https://api.devnet.solana.com` |
| `SOLANA_KEYPAIR_PATH` | Rust backend | `~/.config/solana/id.json` |
| `VITE_DEVELOPER_WALLET` | Frontend | — |
| `DEVELOPER_WALLET` | Rust backend | — |
| `FRONTEND_PORT` | run_server.sh | `8081` |

### Routing
All routes are in `src/App.tsx`. `AppLayout` (`src/components/AppLayout.tsx`) wraps every page with the nav header and wallet connect/disconnect controls. UI components in `src/components/ui/` are shadcn/ui primitives — edit them only if the primitive itself needs to change.
