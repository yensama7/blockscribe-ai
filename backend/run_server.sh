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
FRONTEND_DIR="$REPO_ROOT/repo"
BACKEND_DIR="$REPO_ROOT/repo/backend"
VECTORED_DIR="$BACKEND_DIR/ai-engine/src/vectored"
VECTORED_PY="${VECTORED_DIR}/vector_service.py"
REQ_FILE="${VECTORED_DIR}/requirements.txt"
VENV_DIR="$BACKEND_DIR/ai-engine/.venv"
CARGO_PROJECT_DIR="$BACKEND_DIR/rust-server"

# --- Cleanup ---
cleanup() {
    echo "[*] Stopping services..."

    echo "    Stopping IPFS..."
    pkill -f "ipfs daemon" || true

    echo "    Stopping Solana validator..."
    pkill -f "solana-test-validator" || true

    echo "    Stopping Python vector service..."
    pkill -f "vector_service.py" || true

    echo "    Stopping Cargo server..."
    pkill -f "cargo run" || true

    echo "    Stopping NPM (Vite) server..."
    pkill -f "npm run dev" || true

    if [[ -n "$TAIL_PID" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
        kill "$TAIL_PID"
    fi
    echo "✅ Cleanup complete."
    exit 0
}
trap cleanup SIGINT

# --- Start IPFS ---
echo "[*] Starting IPFS daemon..."
nohup ipfs daemon >"$IPFS_LOG" 2>&1 &
echo "    IPFS running (log: $IPFS_LOG)"

until ipfs id >/dev/null 2>&1; do
    echo "    Waiting for IPFS to be ready..."
    sleep 2
done
echo "    ✅ IPFS ready"

# --- Start Solana validator ---
echo "[*] Starting Solana test validator..."
nohup solana-test-validator >"$SOLANA_LOG" 2>&1 &
echo "    Solana running (log: $SOLANA_LOG)"

until solana cluster-version >/dev/null 2>&1; do
    echo "    Waiting for Solana validator to be ready..."
    sleep 2
done
echo "    ✅ Solana ready"

# --- Python virtual environment setup ---
if [[ ! -d "$VENV_DIR" ]]; then
    echo "[*] Creating Python virtual environment at $VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

echo "[*] Upgrading pip..."
python -m pip install --upgrade pip

if [[ ! -f "$REQ_FILE" ]]; then
    echo "[*] Creating default requirements.txt at $REQ_FILE ..."
    cat > "$REQ_FILE" <<'REQ'
fastapi
uvicorn[standard]
pydantic
# add other deps needed by utils.py
REQ
fi

echo "[*] Installing dependencies from $REQ_FILE ..."
python -m pip install -r "$REQ_FILE"

# --- Start Python vector service ---
if [[ -f "$VECTORED_PY" ]]; then
    echo "[*] Starting Python vector service ($VECTORED_PY) on port 8001..."
    nohup python "$VECTORED_PY" >"$PYTHON_LOG" 2>&1 &
    echo "    Python service running (log: $PYTHON_LOG)"

    sleep 3
    if curl -sS --fail http://127.0.0.1:8001/docs >/dev/null 2>&1; then
        echo "    ✅ Python service ready at http://127.0.0.1:8001"
    else
        echo "❌ Could not verify Python service on port 8001 (check $PYTHON_LOG for details)"
        cleanup
        exit 1
    fi
else
    echo "❌ Python service file not found at $VECTORED_PY."
    cleanup
    exit 1
fi

# --- Start Cargo server ---
if [[ -d "$CARGO_PROJECT_DIR" ]]; then
    echo "[*] Starting Cargo server in $CARGO_PROJECT_DIR ..."
    (cd "$CARGO_PROJECT_DIR" && nohup cargo run >"../$CARGO_LOG" 2>&1 &)
    echo "    Cargo server running (log: $CARGO_LOG)"

    sleep 5
    if curl -sS --fail http://127.0.0.1:8000/ >/dev/null 2>&1; then
        echo "    ✅ Cargo server ready at http://127.0.0.1:8000"
    else
        echo "❌ Could not verify Cargo server on port 8000 (check $CARGO_LOG for details)"
        cleanup
        exit 1
    fi
else
    echo "❌ Cargo project directory not found at $CARGO_PROJECT_DIR."
    cleanup
    exit 1
fi

# --- Start NPM React/Vite server ---
if [[ -d "$FRONTEND_DIR" ]]; then
    echo "[*] Starting NPM (React Vite) server in $FRONTEND_DIR ..."
    cd "$FRONTEND_DIR"

    if [[ ! -d "node_modules" ]]; then
        echo "    Installing npm dependencies..."
        npm install
    fi

    nohup npm run dev >"$BACKEND_DIR/$NPM_LOG" 2>&1 &
    echo "    NPM (Vite) server running (log: $BACKEND_DIR/$NPM_LOG)"

    sleep 5
    if curl -sS --fail http://127.0.0.1:8080/ >/dev/null 2>&1; then
        echo "    ✅ NPM (Vite) server ready at http://127.0.0.1:8080"
    else
        echo "❌ Could not verify NPM server on port 8080 (check $NPM_LOG for details)"
        cleanup
        exit 1
    fi
    cd "$BACKEND_DIR"
else
    echo "❌ Frontend directory not found at $FRONTEND_DIR."
    cleanup
    exit 1
fi

# --- Tail logs ---
echo "[*] Tailing logs (IPFS, Solana, Python, Cargo, NPM)..."
: > "$IPFS_LOG" || true
: > "$SOLANA_LOG" || true
: > "$PYTHON_LOG" || true
: > "$CARGO_LOG" || true
: > "$NPM_LOG" || true

tail -f "$IPFS_LOG" "$SOLANA_LOG" "$PYTHON_LOG" "$CARGO_LOG" "$NPM_LOG" &
TAIL_PID=$!

wait
