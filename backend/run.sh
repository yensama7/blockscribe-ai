#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
CARGO_MANIFEST="$BACKEND_DIR/ai-engine/cargo.toml"
VENV_DIR="$BACKEND_DIR/ai-engine/.venv"
VECTORED_PY="$BACKEND_DIR/ai-engine/src/vectored/vector_service.py"

cd "$BACKEND_DIR"

echo "[*] Starting Rust API (5000)..."
nohup cargo run --manifest-path "$CARGO_MANIFEST" >cargo_server.log 2>&1 &

if [[ -d "$VENV_DIR" ]]; then
  source "$VENV_DIR/bin/activate"
fi

echo "[*] Starting vector service (8001)..."
nohup python "$VECTORED_PY" >vector_service.log 2>&1 &

echo "[*] Starting frontend (8080)..."
cd "$REPO_ROOT"
nohup npm run dev -- --host 0.0.0.0 --port 8080 >"$BACKEND_DIR/npm_server.log" 2>&1 &

echo "✅ Services started."
echo "Frontend: http://127.0.0.1:8080"
echo "Rust API: http://127.0.0.1:5000/health"
echo "Vector service: http://127.0.0.1:8001/docs"
