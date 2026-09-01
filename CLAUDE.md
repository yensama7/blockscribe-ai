# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An academic preservation repository (see `restructure.md` for the full design):
**preservation infrastructure that happens to use a blockchain**. Papers are
deposited via email login (no wallet), screened for similarity, pinned to IPFS,
and anchored on Solana server-side by an institution fee payer. Reads are free —
there is no download fee anywhere in the system.

## Commands

**Frontend**
```bash
npm run dev          # dev server on :8081 (or FRONTEND_PORT)
npm run build        # production build
npm run lint         # eslint (3 pre-existing errors live in shadcn primitives/tailwind config)
```

**Full stack (recommended)**
```bash
cd backend && ./run_server.sh
# Starts: postgres+qdrant+ipfs+solana (docker), Python :8001, Rust :5000, frontend :8081
```

**Infra only**
```bash
docker compose up -d postgres qdrant ipfs solana
```

**Rust backend**
```bash
cargo run --manifest-path backend/ai-engine/Cargo.toml   # needs postgres up
cargo test --manifest-path backend/ai-engine/Cargo.toml --lib
```

**Python vector service**
```bash
cd backend/ai-engine
python -m venv .venv && .venv/Scripts/activate   # (bin/activate on unix)
pip install -r src/vectored/requirements.txt
cd src/vectored && python vector_service.py       # imports are relative to this dir
python -m pytest src/vectored -q                  # run from src/vectored
```

## Architecture

| Component | Location | Port | Role |
|-----------|----------|------|------|
| React/Vite frontend | `src/` | 8081 | Email-login UI (no wallet ever shown) |
| Rust Actix API | `backend/ai-engine/` | 5000 | Auth, submissions, lifecycle, anchoring, verify, OAI-PMH |
| Python FastAPI | `backend/ai-engine/src/vectored/` | 8001 | Chunking, embeddings, similarity, reviewer matching |
| Postgres 16 | docker | 5432 | Primary datastore (schema in `src/db.rs`) |
| Qdrant | docker | 6333 | Vector index — a cache, rebuildable via `/rebuild` |
| IPFS (Kubo) | docker | 5001/8080 | Content-addressed storage |
| solana-test-validator | docker | 8899 | Local chain for anchoring |

### Rust modules (`backend/ai-engine/src/`)
- `bin/main.rs` — all HTTP routes. Auth = Bearer session token in Postgres.
- `db.rs` — pool + idempotent schema (institutions, users, submissions, versions,
  assignments, reviews, similarity_runs, anchors, retractions).
- `chain.rs` — hand-rolled Solana memo transactions (no solana-sdk), custodial
  ed25519 keypairs, and content-addressed PDA derivation (`seeds=[b"doc", sha256]`)
  against the not-yet-deployed Anchor program in `chain/document-registry/`.
- `nlp/engine.rs` — PDF text extraction + Groq metadata extraction with a
  rule-based fallback (pipeline must survive with no GROQ_API_KEY).
- `ipfs.rs`, `vecsvc.rs` — thin clients; both are best-effort, failures never
  kill a deposit.
- `oai.rs` — OAI-PMH 2.0 (oai_dc) for harvesters.

### Python vector layer (`backend/ai-engine/src/vectored/`)
Providers are config values (`EMBEDDING_PROVIDER=local|groq|fake`), only
`config.py` imports concrete classes. Collections are named
`{kind}__{model}__{dim}` so switching models can never hit the dimension trap.
Tests run on `FakeEmbedder` + embedded Qdrant (`:memory:`) — no Docker, no ML
download. `chunking.py` is deliberately upstream of everything; change it and
re-run its tests first.

### Upload pipeline (all server-side, `ingest_pipeline` in main.rs)
hash → duplicate check → `unsafe_upload_reason` validation (content sniff +
reject PDFs with `/JavaScript` or `/Launch`) → **phase 1 (concurrent):** Groq
metadata + IPFS file pin + similarity screen → DB rows + persist similarity run
→ **background task:** metadata-JSON pin + vector ingest + memo anchor. The
deposit response returns after the DB write (~2.5–3.5s, down from ~6s); the
anchor's PDA is derived up front and returned as `status: "processing"`, and the
Submit page polls `/api/verify` to flip it to "confirmed". Ingest and anchor are
deferred because the index is a cache and the anchor is reconciled by
`/api/admin/reanchor`. Users never sign anything and never pay.

Metadata LLM is `openai/gpt-oss-20b` by default (fast; `LLM_MODEL` overrides —
must be a model the Groq key can access). Array-valued fields (authors/keywords)
are coerced to comma-joined strings.

### Peer-review policy (main.rs)
- **Auto-assign on deposit:** the background task calls `auto_assign_reviewers`,
  which matches the top `AUTO_ASSIGN_REVIEWERS` (default 5) reviewers by
  expertise (excluding the author), assigns them, and moves the version to
  `under_review` + anchors `set_under_review`. Editors *add* reviewers, they
  don't do the initial assignment.
- **Reviewed gating:** `submit_review` only sets `reviewed` (+ `finalize_review`
  anchor) once every assignment for the version is `completed`. A startup
  background sweeper finalises stragglers after `REVIEW_TIMEOUT_DAYS` (checks
  every `REVIEW_SWEEP_SECS`; set both low to demo).
- **Editor conflict of interest:** `transition` (publish/retract) rejects the
  request if the acting editor is the paper's corresponding author — another
  editor must decide. The frontend hides editorial actions for editor-authors
  and shows an amber note.

### Other endpoints
- `POST /api/plagiarism-check` — pre-flight similarity vs the whole corpus, no
  DB/ingest/anchor (powers the **Check** page).
- `POST /api/assignments` — editors assign on any paper; the corresponding
  author may request a review on their own paper (author can't self-review).
- Search/related/reviewer results drop score ≤ 0 (Python side, in `similarity.py`
  / `matching.py`).
- `backend/seed_demo.sh` seeds editor/reviewer/author accounts + papers + an
  assignment for demos.

### Key env vars (see `.env.example`)
`DATABASE_URL`, `SOLANA_RPC_URL` (default local validator), `IPFS_API_URL`,
`PYTHON_ENGINE_URL`, `GROQ_API_KEY` (optional), `EMBEDDING_PROVIDER/MODEL/DIM`,
`QDRANT_URL`, `INSTITUTION_NAME`, `EDITOR_EMAILS`.

### Demo conveniences to not mistake for bugs
- The **first user to sign in becomes editor**; everyone after is an author.
- Login is trust-the-typed-email (no magic link) so an audience can switch roles fast.
- Custodial secrets are stored raw in Postgres — `ponytail:` comments mark this
  and every other deliberate shortcut with its production upgrade path.
- If Solana/IPFS/Qdrant are down, deposits still succeed; anchors are recorded
  as `unanchored` and search falls back to keyword mode.

### Routing
All routes in `src/App.tsx`; `AppLayout` wraps every page. UI components in
`src/components/ui/` are shadcn primitives — edit only if the primitive itself
needs to change.
