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

