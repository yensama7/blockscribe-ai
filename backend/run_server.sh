#!/usr/bin/env bash
# Bring up the whole Blockscribe stack for local development:
#   infra (Postgres, Qdrant, IPFS, Solana test validator) in Docker,
#   Rust API + Python vector service + Vite frontend on the host.
# Usage: cd backend && ./run_server.sh
set -e
cd "$(dirname "$0")/.."

echo "==> Starting infra containers (postgres, qdrant, ipfs, solana)..."
docker compose up -d postgres qdrant ipfs solana

echo "==> Starting Python vector service on :8001..."
cd backend/ai-engine
if [ ! -d .venv ]; then
  python -m venv .venv
fi
if [ -f .venv/Scripts/python.exe ]; then PY=.venv/Scripts/python; else PY=.venv/bin/python; fi
$PY -m pip install -q -r src/vectored/requirements.txt
(cd src/vectored && QDRANT_URL="${QDRANT_URL:-http://127.0.0.1:6333}" ../../$PY vector_service.py) &

echo "==> Starting Rust API on :5000..."
DATABASE_URL="${DATABASE_URL:-postgres://postgres:dev@127.0.0.1:5432/postgres}" cargo run --release &

cd ../..
echo "==> Starting frontend on :${FRONTEND_PORT:-8081}..."
npm run dev -- --port "${FRONTEND_PORT:-8081}"
