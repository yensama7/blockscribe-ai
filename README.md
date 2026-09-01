# Blockscribe

**An academic preservation repository for African universities.** Research is
preserved permanently, and its originality, ownership, and review history are
provable cryptographically — by anyone, without trusting the operator.

> Preservation infrastructure that happens to use a blockchain.
> Not a blockchain project that happens to store papers.

Full design rationale: [`restructure.md`](restructure.md).
Plain-language walkthrough and demo script: [`explanation.md`](explanation.md).

## What it does

- **Deposit** — sign in with an email (no wallet, no extension). The system
  extracts metadata, screens the full text for similarity against the whole
  corpus, replicates the file to IPFS, and anchors a timestamped priority claim
  on Solana, signed by the institution's fee payer.
- **Verify** — anyone drops a file on the public verify page and gets a yes/no
  plus the on-chain record. The account address is derived from the file's
  SHA-256 alone (`seeds = [b"doc", hash]`), so no database sits in the trust path.
- **Peer review** — editors get side-by-side similarity reports and
  expertise-matched reviewer suggestions; reviews are pinned to IPFS, hashed,
  signed by the reviewer's key, and anchored. Blind by default.
- **Lifecycle** — submitted → under review → reviewed → published, with
  append-only retraction and version lineage (supersede links) on-chain.
- **Discoverability** — DOIs on every record, OAI-PMH endpoint for Google
  Scholar/BASE/CORE harvesting, Dublin Core metadata on landing pages.
- **Free reads. Always.** There is no download fee anywhere in the system.

## Quick start

Prerequisites: Docker, Rust, Python 3.12, Node 20+.

```bash
# one command (infra in Docker, services on the host):
cd backend && ./run_server.sh
```

or step by step:

```bash
docker compose up -d postgres qdrant ipfs solana

# Python vector service (:8001)
cd backend/ai-engine
python -m venv .venv && .venv/Scripts/activate    # source .venv/bin/activate on unix
pip install -r src/vectored/requirements.txt
cd src/vectored && python vector_service.py

# Rust API (:5000)
cargo run --manifest-path backend/ai-engine/Cargo.toml

# Frontend (:8081)
npm install && npm run dev
```

Open http://localhost:8081. The **first email to sign in becomes the editor**.

## Architecture

| Component | Port | Role |
|-----------|------|------|
| React/Vite frontend (`src/`) | 8081 | Email-login UI |
| Rust Actix API (`backend/ai-engine/`) | 5000 | Auth, submissions, lifecycle, anchoring, verify, OAI-PMH |
| Python FastAPI (`backend/ai-engine/src/vectored/`) | 8001 | Chunking, embeddings, similarity, reviewer matching |
| Postgres 16 (docker) | 5432 | Primary datastore |
| Qdrant (docker) | 6333 | Vector index (a rebuildable cache) |
| IPFS Kubo (docker) | 5001/8080 | Content-addressed storage |
| solana-test-validator (docker) | 8899 | Local chain for anchoring |

The Anchor program for content-addressed PDAs lives in
[`chain/document-registry/`](chain/README.md); until it is deployed the backend
anchors via memo transactions that already commit each record's future PDA.

## Tests

```bash
cd backend/ai-engine/src/vectored && python -m pytest -q   # vector layer (no Docker needed)
cargo test --manifest-path backend/ai-engine/Cargo.toml --lib  # chain wire format + PDA
```
