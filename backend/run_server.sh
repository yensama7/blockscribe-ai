#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
IPFS_LOG="ipfs.log"
SOLANA_LOG="solana.log"
PYTHON_LOG="vector_service.log"

IPFS_PID=""
SOLANA_PID=""
PYTHON_PID=""
TAIL_PID=""

# Paths
VECTORED_DIR="ai-engine/src/vectored"
VECTORED_PY="${VECTORED_DIR}/vector_service.py"
REQ_FILE="${VECTORED_DIR}/requirements.txt"
VENV_DIR="ai-engine/.venv"

# --- Cleanup (runs on Ctrl+C / SIGINT) ---
cleanup() {
    echo "[*] Stopping services..."
    if [[ -n "$IPFS_PID" ]] && kill -0 "$IPFS_PID" 2>/dev/null; then
        kill "$IPFS_PID"
        echo "    Stopped IPFS (PID $IPFS_PID)"
    fi
    if [[ -n "$SOLANA_PID" ]] && kill -0 "$SOLANA_PID" 2>/dev/null; then
        kill "$SOLANA_PID"
        echo "    Stopped Solana (PID $SOLANA_PID)"
    fi
    if [[ -n "$PYTHON_PID" ]] && kill -0 "$PYTHON_PID" 2>/dev/null; then
        kill "$PYTHON_PID"
        echo "    Stopped Python service (PID $PYTHON_PID)"
    fi
    if [[ -n "$TAIL_PID" ]] && kill -0 "$TAIL_PID" 2>/dev/null; then
        kill "$TAIL_PID"
    fi
    echo "✅ Cleanup complete."
    exit 0
}
trap cleanup SIGINT

# --- Start IPFS ---
echo "[*] Starting IPFS daemon..."
ipfs daemon >"$IPFS_LOG" 2>&1 &
IPFS_PID=$!
echo "    IPFS PID: $IPFS_PID"

until ipfs id >/dev/null 2>&1; do
    echo "    Waiting for IPFS to be ready..."
    sleep 2
done
echo "    ✅ IPFS ready"

# --- Start Solana validator ---
echo "[*] Starting Solana test validator..."
solana-test-validator >"$SOLANA_LOG" 2>&1 &
SOLANA_PID=$!
echo "    Solana PID: $SOLANA_PID"

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

# Activate venv
source "$VENV_DIR/bin/activate"

# Upgrade pip in venv (safe, no PEP 668 issues)
python -m pip install --upgrade pip

# --- Install Python dependencies ---
if [[ -f "$REQ_FILE" ]]; then
    echo "[*] Installing dependencies from $REQ_FILE ..."
    python -m pip install -r "$REQ_FILE"
else
    echo "⚠️  $REQ_FILE not found — skipping Python dependency install"
fi

# --- Start Python vector service ---
if [[ -f "$VECTORED_PY" ]]; then
    echo "[*] Starting Python vector service ($VECTORED_PY) on port 8001..."
    python "$VECTORED_PY" >"$PYTHON_LOG" 2>&1 &
    PYTHON_PID=$!
    echo "    Python service PID: $PYTHON_PID"

    sleep 3
    if curl -sS --fail http://127.0.0.1:8001/docs >/dev/null 2>&1; then
        echo "    ✅ Python service ready at http://127.0.0.1:8001"
    else
        echo "    ⚠️ Could not verify Python service on port 8001 (check $PYTHON_LOG for details)"
    fi
else
    echo "❌ Python service file not found at $VECTORED_PY. Skipping start."
fi

# --- Tail logs ---
echo "[*] Tailing logs (IPFS, Solana, Python)..."
: > "$IPFS_LOG" || true
: > "$SOLANA_LOG" || true
: > "$PYTHON_LOG" || true

tail -f "$IPFS_LOG" "$SOLANA_LOG" "$PYTHON_LOG" &
TAIL_PID=$!

wait
