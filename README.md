# Blockscribe AI

Blockscribe AI is a two-part system for ingesting, analyzing, and serving documents with blockchain anchoring.  
It consists of:

- **Rust Actix-Web server** (main entrypoint)  
  Handles file uploads, metadata extraction, storage in SQLite, Solana memo posting, and querying.

- **Python FastAPI service**  
  Provides vector search and analytics endpoints (difficulty, genre distribution, clustering).

---

## Features

- Upload files → extract metadata, compute hash & CID, store in SQLite (`archive.db`), and anchor a memo on Solana.
- Query stored records by ID or fields.
- Vector search powered by Python backend.
- Analytics endpoints (difficulty distribution, genre breakdown, clustering).
- Full JSON APIs for integration.

---

## Requirements

- Rust (latest stable)
- Python 3.10+
- SQLite3
- Solana CLI / RPC connection (for `send_memo`)
- [Poetry](https://python-poetry.org/) or `pip` for Python deps

---

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/yensama7/blockscribe-ai.git
cd blockscribe-ai
```

### 2. Run the development stack

We provide a single script to bring up all services:

- IPFS daemon  
- Solana test validator  
- Python FastAPI vector service  
- Rust Actix-Web server  
- React Vite frontend (port 8080)  

From the `blockscribe-ai/backend/` directory:

```bash
cd blockscribe-ai/backend
chmod +x run_server.sh
./run_server.sh
```

#### What the script does

- Start each service in the background with `nohup`.
- Install missing dependencies automatically (`pip install -r requirements.txt`, `npm install`).
- Health-check all services. If any service fails, the script cleans up and exits.
- Tail logs:
  - `ipfs.log`
  - `solana.log`
  - `vector_service.log`
  - `cargo_server.log`
  - `npm_server.log`

---

#### Access the services

- React frontend: [http://localhost:8080](http://localhost:8080)
- Rust API: [http://localhost:8000](http://localhost:8000)
- Python FastAPI docs: [http://localhost:8001/docs](http://localhost:8001/docs)
- IPFS daemon: [http://127.0.0.1:5001/webui](http://127.0.0.1:5001/webui)
- Solana test validator: running locally  

---

#### Development Notes

- Logs are written to the `blockscribe-ai/backend/` directory:
  - `ipfs.log`
  - `solana.log`
  - `vector_service.log`
  - `cargo_server.log`
  - `npm_server.log`

- Modify `run_server.sh` if you need to change ports or add services.  
