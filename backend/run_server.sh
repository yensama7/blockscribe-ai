#!/usr/bin/env bash
set -euo pipefail

IPFS_LOG="ipfs.log"
SOLANA_LOG="solana.log"
PYTHON_LOG="vector_service.log"
CARGO_LOG="cargo_server.log"
NPM_LOG="npm_server.log"
TAIL_PID=""

BACKEND_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT"
VECTORED_DIR="$BACKEND_DIR/ai-engine/src/vectored"
VECTORED_PY="$VECTORED_DIR/vector_service.py"
REQ_FILE="$VECTORED_DIR/requirements.txt"
VENV_DIR="$BACKEND_DIR/ai-engine/.venv"
CARGO_MANIFEST="$BACKEND_DIR/ai-engine/cargo.toml"

cleanup() {
    echo "[*] Stopping services..."
    pkill -f "ipfs daemon" || true
    pkill -f "solana-test-validator" || true
    pkill -f "vector_service.py" || true
    pkill -f "cargo run --manifest-path $CARGO_MANIFEST" || true
    pkill -f "vite --host 0.0.0.0 --port 8080" || true
    [[ -n "$TAIL_PID" ]] && kill "$TAIL_PID" 2>/dev/null || true
    echo "✅ Cleanup complete."
    exit 0
}
trap cleanup SIGINT

cd "$BACKEND_DIR"

echo "[*] Starting IPFS daemon..."
if ! pgrep -x ipfs >/dev/null 2>&1; then
    nohup ipfs daemon >"$IPFS_LOG" 2>&1 &
fi
until ipfs id >/dev/null 2>&1; do
    echo "    Waiting for IPFS to be ready..."
    sleep 2
done
echo "    ✅ IPFS ready"

SOLANA_RPC_URL="${SOLANA_RPC_URL:-http://127.0.0.1:8899}"

if [[ "$SOLANA_RPC_URL" == "http://localhost:8899" || "$SOLANA_RPC_URL" == "http://127.0.0.1:8899" ]]; then
    echo "[*] Starting Solana test validator..."
    if ! pgrep -x "solana-test-validator" >/dev/null 2>&1; then
        nohup solana-test-validator >"$SOLANA_LOG" 2>&1 &
    fi
    until solana cluster-version -u "$SOLANA_RPC_URL" >/dev/null 2>&1; do
        echo "    Waiting for Solana validator to be ready..."
        sleep 2
    done
    echo "    ✅ Solana ready at $SOLANA_RPC_URL"
else
    echo "[*] Using external Solana RPC: $SOLANA_RPC_URL"
    solana cluster-version -u "$SOLANA_RPC_URL" >/dev/null 2>&1 || {
        echo "❌ Could not reach Solana RPC at $SOLANA_RPC_URL"
        cleanup
    }
    echo "    ✅ Solana RPC reachable"
fi

if [[ ! -d "$VENV_DIR" ]]; then
    echo "[*] Creating Python virtual environment at $VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install -r "$REQ_FILE"

echo "[*] Starting Python vector service..."
nohup python "$VECTORED_PY" >"$PYTHON_LOG" 2>&1 &
sleep 3
curl -sSf http://127.0.0.1:8001/docs >/dev/null || {
    echo "❌ Could not verify Python service (check $PYTHON_LOG)"
    cleanup
}
echo "    ✅ Python service ready at http://127.0.0.1:8001"

echo "[*] Starting Rust API server..."
nohup cargo run --manifest-path "$CARGO_MANIFEST" >"$CARGO_LOG" 2>&1 &
sleep 5
curl -sSf http://127.0.0.1:5000/health >/dev/null || {
    echo "❌ Could not verify Rust API (check $CARGO_LOG)"
    cleanup
}
echo "    ✅ Rust API ready at http://127.0.0.1:5000"

echo "[*] Starting Vite frontend on port 8080..."
cd "$FRONTEND_DIR"
[[ -d node_modules ]] || npm install
nohup npm run dev -- --host 0.0.0.0 --port 8080 >"$BACKEND_DIR/$NPM_LOG" 2>&1 &
sleep 4
curl -sSf http://127.0.0.1:8080/ >/dev/null || {
    echo "❌ Could not verify Vite frontend (check $NPM_LOG)"
    cleanup
}
echo "    ✅ Frontend ready at http://127.0.0.1:8080"

cd "$BACKEND_DIR"
echo "[*] Tailing logs (IPFS, Solana, Python, Cargo, NPM)..."
tail -f "$IPFS_LOG" "$SOLANA_LOG" "$PYTHON_LOG" "$CARGO_LOG" "$NPM_LOG" &
TAIL_PID=$!
wait
