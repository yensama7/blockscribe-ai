#!/usr/bin/env bash
set -euo pipefail

echo "[*] Running install.sh (dependencies setup)..."

# Paths
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/blockscribe-ai"
BACKEND_DIR="$REPO_ROOT/blockscribe-ai/backend"
VECTORED_DIR="$BACKEND_DIR/ai-engine/src/vectored"
REQ_FILE="${VECTORED_DIR}/requirements.txt"
VENV_DIR="$BACKEND_DIR/ai-engine/.venv"

# --- Install system deps ---
echo "[*] Installing system dependencies (apt)..."
sudo apt-get update
sudo apt-get install -y curl build-essential pkg-config libssl-dev jq

# --- Install IPFS (if not already installed) ---
if ! command -v ipfs >/dev/null 2>&1; then
    echo "[*] Installing IPFS..."
    curl -L https://dist.ipfs.tech/kubo/v0.29.0/kubo_v0.29.0_linux-amd64.tar.gz -o /tmp/ipfs.tar.gz
    tar -xzf /tmp/ipfs.tar.gz -C /tmp
    sudo bash /tmp/kubo/install.sh
    rm -rf /tmp/ipfs.tar.gz /tmp/kubo
else
    echo "    IPFS already installed."
fi

# --- Install Solana CLI ---
if ! command -v solana >/dev/null 2>&1; then
    echo "[*] Installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
else
    echo "    Solana CLI already installed."
fi

# --- Setup Python virtual environment ---
if [[ ! -d "$VENV_DIR" ]]; then
    echo "[*] Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

echo "[*] Upgrading pip..."
python -m pip install --upgrade pip

if [[ ! -f "$REQ_FILE" ]]; then
    echo "[*] Creating default requirements.txt..."
    cat > "$REQ_FILE" <<'REQ'
fastapi
uvicorn[standard]
pydantic
REQ
fi

echo "[*] Installing Python requirements..."
python -m pip install -r "$REQ_FILE"

# --- Install Node.js deps ---
if [[ -d "$FRONTEND_DIR" ]]; then
    cd "$FRONTEND_DIR"
    echo "[*] Installing NPM dependencies..."
    npm install
fi

echo "✅ install.sh completed successfully."
