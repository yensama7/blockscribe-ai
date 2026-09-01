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

Prerequisites: Docker, Rust, Python 3.12, Node 20+. No environment setup is
required to start — see [Configuration](#configuration-environment-variables)
for the optional Groq key that enables AI metadata extraction.

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

## Configuration (environment variables)

**You don't need to set anything to run the project.** Every variable has a
default that matches the Docker services on their standard ports, so a fresh
clone runs out of the box. The one worth setting is `GROQ_API_KEY`, which turns
on AI metadata extraction.

Copy the template and edit it if you want to change any default:

```bash
cp .env.example backend/ai-engine/.env
```

The Rust API loads `backend/ai-engine/.env` automatically on startup. The
Python vector service reads the `EMBEDDING_*` / `QDRANT_URL` values from its own
process environment (set them in the shell, or via `docker compose`).

### Rust API (`backend/ai-engine/.env`)

| Variable | Default | Needed? | What it does |
|----------|---------|---------|--------------|
| `DATABASE_URL` | `postgres://postgres:dev@127.0.0.1:5432/postgres` | matches the Docker Postgres | Primary datastore connection |
| `SOLANA_RPC_URL` | `http://127.0.0.1:8899` | matches the Docker validator | Chain endpoint for anchoring |
| `IPFS_API_URL` | `http://127.0.0.1:5001` | matches the Docker Kubo node | Where files are pinned |
| `IPFS_GATEWAY_URL` | `http://127.0.0.1:8080` | matches the Docker Kubo node | Public read link shown in the UI |
| `PYTHON_ENGINE_URL` | `http://127.0.0.1:8001` | matches the vector service | Similarity / search backend |
| `GROQ_API_KEY` | *(unset)* | **optional, recommended** | Enables AI metadata extraction. Without it, a rule-based parser is used (titles/abstracts are weaker). |
| `LLM_MODEL` | `openai/gpt-oss-120b` | only with a Groq key | Must be a model your Groq key can access (`curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"` lists them). |
| `INSTITUTION_NAME` | `Demo University` | optional | Shown across the UI and in OAI-PMH |
| `EDITOR_EMAILS` | *(unset)* | optional | Comma-separated emails granted editor role. The **first user to sign in is made editor regardless.** |
| `SIMILARITY_THRESHOLD` | `0.82` | optional | Score above which a passage is flagged as a match |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:5000` | optional | Base URL embedded in OAI-PMH records |
| `SOLANA_KEYPAIR_PATH` | *(auto-generates `fee_payer.json`)* | optional | Fee-payer key file (dev only; production uses a KMS/HSM) |

### Python vector service (process env)

| Variable | Default | What it does |
|----------|---------|--------------|
| `QDRANT_URL` | `http://127.0.0.1:6333` | Vector database (matches the Docker Qdrant) |
| `EMBEDDING_PROVIDER` | `local` | `local` (sentence-transformers), `groq`, or `fake` (deterministic, for tests) |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Dev default (~80 MB). Production: `BAAI/bge-m3` |
| `EMBEDDING_DIM` | `384` | Must match the model (bge-m3 is `1024`) |

> Getting a Groq key: sign up at [console.groq.com](https://console.groq.com),
> create an API key, and put it in `backend/ai-engine/.env` as
> `GROQ_API_KEY=...`. It is free for this workload. Keep `.env` out of git — it
> is already gitignored.
>
> No connection or don't want a key? The vector service still works with
> `EMBEDDING_PROVIDER=fake EMBEDDING_DIM=64` (copy detection stays exact;
> semantic search is just less clever), and metadata falls back to the
> rule-based parser.

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
