# System Instructions for Coding Agent

## Core Philosophy
Stick strictly to the YAGNI principle (You Aren't Gonna Need It). Do not build features, abstractions, or extra layers that are not explicitly requested in this document. Keep the logic lean and focused entirely on the functional requirements.

## Project Overview
We are building a decentralized open source library. Users can upload manuscripts, books, or PDFs to the platform. The core integrity of the system relies on storing the file on IPFS and anchoring the file's hash and metadata on the Solana blockchain (Devnet) for immutable verification.

## Working Principles and Data Flow

### 1. Authentication
Users must link their Solana wallet to interact with the platform. This should be restricted to the Solana Devnet for demonstration purposes.

### 2. Upload and AI Extraction
When a user uploads a book, the file goes to the backend. The backend passes the content to the AI engine (Groq) to extract key metadata: the title, genre, difficulty, and a brief summary.

### 3. Hashing and IPFS Storage
The backend computes a cryptographic hash of the uploaded book. The file is then sent to the local IPFS daemon, which returns the Content Identifier (CID).

### 4. Blockchain Anchoring
The system prepares a payload containing the CID, the book's hash, the title, and the uploader's wallet address. This payload is pushed to the Solana blockchain using a Memo transaction. The frontend handles sending this transaction to ensure it is signed by the user's wallet.

### 5. Immutability and Verification
The frontend must include a verification feature for uploaded materials. When verifying a document, the system must fetch the memo directly from the Solana blockchain. It then compares the hash found in the on-chain memo with the hash of the file in question. Do not rely on the local database for this comparison. The blockchain acts as the single source of truth.

## Suggestions for Improvement and Efficiency

*   **Cryptographic Batching:** Right now, we anchor every single book. As the platform scales, we could optimize this by grouping document hashes into a Merkle tree and anchoring only the root hash on-chain. This would drastically cut down on transaction fees while maintaining mathematical proof of inclusion.
*   **Privacy and Advanced Verification:** We might want to look into zero-knowledge proofs later on. This would allow a user or the system to verify certain attributes of a book (like its difficulty or genre) without exposing the entire text to the verifier.
*   **Asynchronous AI Processing:** Calling the Groq API can introduce latency. Consider moving the AI metadata extraction to a background queue so the user is not left waiting on a loading screen during the upload process.
*   **IPFS Persistence:** Relying solely on a local IPFS daemon might lead to broken links if the node goes down. Integrating a dedicated pinning service would ensure the CIDs remain accessible long term.
