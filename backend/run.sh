#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
IPFS_LOG="ipfs.log"
SOLANA_LOG="solana.log"
PYTHON_LOG="vector_service.log"
CARGO_LOG="cargo_server.log"
NPM_LOG="npm_server.log"
TAIL_PID=""

# Paths
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/blockscribe-ai"
BACKEND_DIR="$REPO_ROOT/blockscribe-ai/backend"
VECTORED_DIR="$BACKEND_DIR/ai-engine/src/vectored"
VECTORED_PY="${VECTORED_DIR}/vector_service.py"
VENV_DIR="$BACKEND_DIR/ai-engine/.venv"
CARGO_PROJECT_DIR="$BACKEND_DIR/ai-engine/src/bin"

# --- Cleanup ---
cleanup() {
    echo "[*] Stopping services..."
    pkill -f "ipfs daemon" || true
    pkill -f "solana-test-validator" || true
    pkill -f "vector_service.py" || true
    pkill -f "cargo run" || true
    pkill -f "npm run dev" || true
    [[ -n "$TAIL_PID" ]] && kill "$TAIL_PID" 2>/dev/null || true
    echo "✅ Cleanup complete."
    exit 0
}
trap cleanup SIGINT

# --- Start IPFS ---
echo "[*] Starting IPFS daemon..."
if ! pgrep -x "ipfs" >/dev/null; then
    nohup ipfs daemon >"$IPFS_LOG" 2>&1 &
    echo "    IPFS running (log: $IPFS_LOG)"
fi
until ipfs id >/dev/null 2>&1; do
    echo "    Waiting for IPFS..."
    sleep 2
done
echo "    ✅ IPFS ready"

# --- Start Solana ---
echo "[*] Starting Solana test validator..."
if ! pgrep -x "solana-test-validator" >/dev/null; then
    nohup solana-test-validator >"$SOLANA_LOG" 2>&1 &
    echo "    Solana started (log: $SOLANA_LOG)"
else
    echo "    Solana already running."
fi
until solana cluster-version >/dev/null 2>&1; do
    echo "    Waiting for Solana..."
    sleep 2
done
echo "    ✅ Solana ready"

# --- Cargo server ---
if [[ -d "$CARGO_PROJECT_DIR" ]]; then
    echo "[*] Starting Cargo server..."
    (cd "$CARGO_PROJECT_DIR" && nohup cargo run >"../$CARGO_LOG" 2>&1 &)
    sleep 5
    curl -sSf http://127.0.0.1:8000/ >/dev/null && \
        echo "    ✅ Cargo ready" || \
        { echo "❌ Cargo failed (check $CARGO_LOG)"; cleanup; }
else
    echo "❌ Cargo project directory not found."
    cleanup
fi

# --- NPM server ---
if [[ -d "$FRONTEND_DIR" ]]; then
    echo "[*] Starting NPM dev server..."
    cd "$FRONTEND_DIR"
    nohup npm run dev >"$BACKEND_DIR/$NPM_LOG" 2>&1 &
    sleep 5
    curl -sSf http://127.0.0.1:8080/ >/dev/null && \
        echo "    ✅ NPM ready" || \
        { echo "❌ NPM failed (check $NPM_LOG)"; cleanup; }
    cd "$BACKEND_DIR"
else
    echo "❌ Frontend not found at $FRONTEND_DIR"
    cleanup
fi

# --- Python service ---
if [[ -f "$VECTORED_PY" ]]; then
    source "$VENV_DIR/bin/activate"
    echo "[*] Starting Python vector service..."
    nohup python "$VECTORED_PY" >"$PYTHON_LOG" 2>&1 &
    sleep 3
    curl -sSf http://127.0.0.1:8001/docs >/dev/null && \
        echo "    ✅ Python service ready" || \
        { echo "❌ Python service failed (check $PYTHON_LOG)"; cleanup; }
else
    echo "❌ Python service file not found at $VECTORED_PY."
    cleanup
fi
# --- Tail logs ---
echo "[*] Tailing logs..."
: > "$IPFS_LOG" "$SOLANA_LOG" "$PYTHON_LOG" "$CARGO_LOG" "$NPM_LOG" || true
tail -f "$IPFS_LOG" "$SOLANA_LOG" "$PYTHON_LOG" "$CARGO_LOG" "$NPM_LOG" &
TAIL_PID=$!
wait
