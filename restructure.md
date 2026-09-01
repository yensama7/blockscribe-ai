# restructure.md

Restructuring Blockscribe AI into an academic repository for schools and research institutions.

This document captures the decisions taken so far, what carries over from the existing
codebase, what changes, and what to build in what order. It ends with production practices
and a scaling path.

---

## 1. What the project is

An academic repository for African universities that preserves research permanently and
proves originality, ownership, and review history cryptographically.

The framing matters and should be consistent everywhere — pitch decks, README, grant
applications, conversations with vice-chancellors:

> **Preservation infrastructure that happens to use a blockchain.**
> Not a blockchain project that happens to store papers.

The second framing loses the room. The first describes a problem people already feel.

### The problem being solved

Institutional repositories across African universities are fragile. Theses, final-year
projects, dissertations, and local-language research routinely exist as a single PDF on a
single machine in a single department. When the server dies, the funding lapses, or the
person who maintained it leaves, decades of scholarship disappears. There is no replication,
no permanent identifier, and often no catalogue.

Alongside that:

- Plagiarism screening is priced out of reach for most institutions.
- Priority disputes ("I had this result first") have no neutral evidence.
- Retracted papers keep accumulating citations because the notice never propagates.
- Peer review labour is invisible and non-portable.

### Users

| Role | What they do |
|------|--------------|
| Author / researcher | Deposits papers, claims priority, submits revisions |
| Reviewer | Receives assignments, submits signed reviews |
| Editor | Assigns reviewers, reads similarity reports, makes decisions |
| Reader / student | Searches, browses, downloads, verifies |
| Institutional admin | Manages users, branding, policy, pinning |
| Anonymous public | Verifies any file against the chain with no account |

---

## 2. What carries over from Blockscribe

The existing pipeline is close to what an institutional repository needs. Roughly 60% of the
plumbing is reusable.

**Keep, with edits:**

- Rust Actix service (`backend/ai-engine/src/bin/main.rs`) — upload handling, hashing,
  integrity endpoints, Solana interaction. The shape is right.
- IPFS pinning layer via Kubo.
- React/Vite frontend (`src/`) — routing, layout, upload and verify screens.
- `src/services/api.ts` — the API client pattern, though the `/metadata` endpoint should stop
  returning positional `string[][]` rows and return proper JSON objects. Delete
  `normalizeMetadataRows()`; it exists only to paper over a bad response shape.
- Python FastAPI service (`backend/ai-engine/src/vectored/`) — this becomes far more
  important than it currently is. See section 5.
- `run_server.sh` orchestration — add Qdrant and Postgres containers to it.

**Remove:**

- **The download fee split.** `POST /download/settle-fee`, `DownloadFeePlan`,
  `sendFeeSplitTransfer`, and the `DEVELOPER_WALLET` / `VITE_DEVELOPER_WALLET` env vars all
  go. Charging per download makes sense for a document marketplace. In an academic library it
  is fatal: it excludes exactly the students who need access most, and it puts the project on
  the wrong side of open-access norms that funders and universities care about. Reads are
  free. Revenue, if any, comes from institutional subscriptions for hosting and screening —
  not from readers.

- **Mandatory wallet-gating.** `src/context/WalletContext.tsx` currently detects
  `window.solana` and gates every document action. Asking a senior professor to install
  Phantom before uploading is where adoption dies. Replace with institutional email / SSO
  login, with a wallet generated and custodied behind the scenes. Power users may connect
  their own wallet; everyone else never learns there is one. See section 4.

- **The memo program as the anchoring mechanism.** See section 3.

- **SQLite as the primary datastore.** Fine for one machine. Not fine for multiple
  institutions, concurrent review workflows, or the relational model in section 6.

- **`window.solanaWeb3` loaded from CDN** (`src/lib/solanaTransactions.ts`). Move to a proper
  npm dependency so the build is reproducible and the supply chain is auditable.

---

## 3. Chain design

### The problem with the current approach

The memo program gives proof-of-existence but nothing queryable. Memo data is not indexed by
content, so "pull the hash from the chain and verify" actually resolves to:

1. Hash the uploaded file.
2. Look the hash up in SQLite to find the transaction signature.
3. Fetch that transaction from RPC.
4. Compare the memo contents.

Step 2 puts your database in the trust path. If it is lost, corrupted, or tampered with, the
anchor becomes unfindable. The cryptographic guarantee is real but unreachable without your
cooperation, which undercuts the entire claim.

### The fix: a small Anchor program with content-addressed PDAs

Derive the account address from the document hash itself:

```rust
seeds = [b"doc", &sha256_hash[..]]
```

Verification becomes a single deterministic account fetch. Given only the file, anyone
derives the address and reads the record — no database, no API, no cooperation from you.
That is what makes "independently verifiable" true rather than marketing.

### Account layout

```rust
#[account]
pub struct DocumentRecord {
    pub hash: [u8; 32],            // SHA-256 of the file
    pub cid: String,               // IPFS CID (content address)
    pub metadata_cid: String,      // IPFS CID of the metadata JSON
    pub uploader: Pubkey,          // author or custodial wallet
    pub institution: Pubkey,       // registered institution signer
    pub created_at: i64,           // unix timestamp
    pub updated_at: i64,
    pub status: DocStatus,
    pub version: u16,              // 1, 2, 3...
    pub previous: Option<Pubkey>,  // PDA of the prior version
    pub review_count: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum DocStatus {
    Submitted,
    UnderReview,
    Reviewed,
    Published,
    Retracted,
    Superseded,
}
```

### Instructions

| Instruction | Who signs | Effect |
|-------------|-----------|--------|
| `anchor_submission` | uploader + institution | Creates the PDA, status `Submitted` |
| `set_under_review` | institution | Status transition |
| `attach_review` | institution | Increments `review_count`, points at review CID |
| `finalize_review` | institution | Status `Reviewed` |
| `publish` | institution | Status `Published` |
| `retract` | institution | Status `Retracted`, appends reason CID |
| `supersede` | institution | Status `Superseded`, links forward to new version |

Roughly 200–300 lines of Anchor. It is the difference between a demo and infrastructure.

### Hard rules

- **Never put paper contents on-chain.** Hash and CID only. Everything substantive lives on
  IPFS; the chain holds pointers and state.
- **Metadata goes to IPFS as a JSON blob**, and its CID goes in the account. Metadata changes
  therefore produce a new CID and an on-chain update, which is itself an audit trail.
- **The chain is append-only.** Nothing is ever deleted. Corrections are new state, not edits.

### Cost

Each PDA needs rent-exempt SOL — a few thousand lamports at this account size. At current
prices this is fractions of a cent per document. Budget for it as an operating cost and have
the institution's fee payer cover it, never the user.

---

## 4. Identity and auth

**Default path:** institutional email or SSO (SAML / OIDC against the university IdP where
one exists, email magic link where it does not). A Solana keypair is generated on first login
and held custodially, encrypted at rest with a KMS-backed key.

**Opt-out path:** users who want self-custody connect their own wallet and the system stops
holding a key for them.

**Why custodial by default:** academics will lose keys. This is not a hypothetical. A
repository that permanently loses a researcher's ability to prove authorship because they
reinstalled their browser is worse than no repository. Recovery must be designed in from day
one, and recovery is only possible with custody or with a social-recovery scheme that is
itself more complex than most users will tolerate.

Be honest in the documentation about which parts are trustless (verification, anchoring) and
which are not (key custody, editorial decisions). Overclaiming here is the fastest way to
lose credibility with the technical audience while confusing the non-technical one.

---

## 5. The vector layer

This is the part that gets you into schools. The blockchain is the durability story; the
vector layer is the daily-use story.

### Storage

Move the Python service from an in-memory index to **Qdrant**. It is self-hostable, has no
licence cost, supports rich payload filtering, and runs acceptably on modest hardware.
Postgres with `pgvector` is the reasonable alternative if you want one less service to
operate, at the cost of weaker filtering ergonomics at scale.

### Chunking

Split each paper into overlapping chunks of roughly 500 tokens with about 15% overlap.

**Embed at chunk level, not document level.** A whole-document vector blurs everything
together and is useless for catching a copied methodology section. Also keep one
abstract-level vector per paper for browse, recommendation, and reviewer matching.

Write the chunker and its tests *before* the search logic. Chunk boundaries determine
everything downstream, and PDF text extraction is messier than it looks: ligatures,
hyphenation across line breaks, two-column layouts interleaving, headers and footers bleeding
into body text, equations becoming noise. If the chunker is bad, no embedding model rescues
it.

### Payload schema

Every point carries:

```json
{
  "submission_id": "uuid",
  "version_id": "uuid",
  "chunk_index": 12,
  "section": "methodology",
  "institution": "uuid",
  "uploader": "uuid",
  "status": "under_review",
  "visibility": "embargoed",
  "discipline": "public_health",
  "year": 2026,
  "language": "en",
  "embedding_model": "bge-m3",
  "embedding_dim": 1024
}
```

Storing the model name and dimension in the payload is not optional. When you upgrade models
you need to know exactly what to re-embed.

### Four jobs, one index

**Plagiarism and duplicate detection.** Query every incoming chunk against the corpus. Chunks
above threshold get flagged, contiguous flagged chunks get grouped into passages, and the
editor sees a side-by-side against the matched source. Filter `uploader != current_user` for
external plagiarism, `uploader == current_user` for self-plagiarism. Run this *before*
anything is anchored, so nothing unchecked enters the permanent record.

**Reviewer matching.** Embed the submission abstract, search reviewer profile vectors built
from their own past work, exclude co-authors and same-institution candidates via payload
filters, return a ranked shortlist. Editors currently do this by hand and it is one of the
slowest parts of the process.

**Semantic search.** Concept queries rather than keyword matching. This matters most for
older scanned material with poor OCR and inconsistent metadata, which is exactly the material
most at risk.

**Related papers.** Nearest neighbours on the abstract vector build a citation-adjacent
graph, surfacing links between departments and institutions that would otherwise never find
each other.

### Treat the index as a cache

The source of truth is IPFS plus the chain. You must be able to wipe Qdrant entirely and
rebuild it from scratch. Write that rebuild job early and run it in CI. If rebuilding is not
possible, the index has quietly become a second source of truth and you have two systems that
can disagree.

---

## 6. Inference providers

**Groq is a good fit for LLM work, not for the embedding layer.**

Use it for metadata extraction (title, authors, affiliations, abstract, keywords, references
out of a messy PDF), summarisation, and structuring review reports. It is fast, cheap,
OpenAI-compatible so provider swaps are trivial, and requires no GPU management. Whisper on
Groq is useful later for lecture and defence recordings.

**Self-host embeddings.** Three reasons:

1. *Volume.* You embed every chunk of every paper, then re-embed the whole corpus on every
   model change. That is a completely different workload from one metadata call per
   submission, and it is where per-token pricing bites.
2. *Confidentiality.* Under-review manuscripts and embargoed theses are exactly the material
   authors are anxious about. "We never send unpublished full text off our servers" is a much
   easier sentence to say to a cautious professor than any vendor retention policy.
3. *Control.* If a hosted embedding model is deprecated or silently updated, every stored
   vector's comparability degrades and you find out from bad search results.

**Keep the project's hard dependencies minimal.** This is preservation infrastructure.
Metadata extraction failing over to a rule-based parser is a bad day. An unrebuildable vector
index because a vendor retired a model is much worse.

---

## 7. Abstraction layer

Provider choice must be a config value, never wired through the code.

### Protocols

```python
from typing import Protocol, Sequence

class Embedder(Protocol):
    name: str
    dim: int
    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...

class VectorStore(Protocol):
    def ensure_collection(self, name: str, dim: int) -> None: ...
    def upsert(self, name: str, ids, vectors, payloads) -> None: ...
    def search(self, name: str, vector, limit: int, filters=None) -> list[Hit]: ...
    def delete(self, name: str, ids) -> None: ...
```

### Implementations

| Class | Backing | Used for |
|-------|---------|----------|
| `LocalEmbedder` | sentence-transformers | Dev and production default |
| `GroqEmbedder` | Groq API | Optional / fallback |
| `FakeEmbedder` | Deterministic hash of text | Tests |
| `QdrantStore` | Qdrant client | Everything |

`FakeEmbedder` matters more than it sounds. It lets the test suite exercise chunking, upsert
logic, filtering, and duplicate grouping in milliseconds without loading an ML library.

### Config

```
EMBEDDING_PROVIDER=local        # local | groq | fake
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIM=1024
VECTOR_STORE=qdrant
QDRANT_URL=http://localhost:6333
LLM_PROVIDER=groq               # groq | local | openai
LLM_MODEL=llama-3.3-70b-versatile
```

Nothing above the factory imports `sentence_transformers` or `qdrant_client`. Service code
sees only the protocols.

### The dimension trap

Qdrant collections have a fixed vector dimension. Switching from MiniLM (384) to bge-m3
(1024) makes every write fail against the old collection. Do not fight this — encode the
model into the collection name:

```python
collection = f"papers__{model_name}__{dim}"
```

Switching models now creates a fresh collection instead of erroring, both can coexist during
migration, and you can A/B two models over the same corpus.

---

## 8. Document lifecycle

```
Submitted → UnderReview → Reviewed → Published
                                  ↘ Retracted
                                  ↘ Superseded
```

Every transition writes to the same PDA.

**Anchor at submission** — this is the thing individual researchers care about most: a
timestamped priority claim. "I had this result on this date, here is cryptographic proof."
Scooping is a real fear and it is worse for people at institutions without the visibility to
defend a claim. Anchoring only after peer review throws away your strongest individual value
proposition.

**Anchor at review** — this is the credibility signal for readers. Reviewed work carries an
on-chain attestation; unreviewed work is visibly unreviewed.

Both, not one or the other.

### Versioning

Each revision gets its own hash and its own PDA, with `previous` pointing at the prior
version. The chain then holds the complete revision lineage, which is genuine evidence of how
a paper evolved through review and settles disputes about which version was cited or
reviewed.

Each version gets its own vectors, tagged in the payload so search returns only the current
version by default.

### Retraction

You cannot delete from a blockchain, but you can append. A retraction is a status change on
the PDA plus a reason CID.

This is one of the few places a chain solves a real problem rather than decorating one.
Retraction tracking in academia is badly broken — retracted papers keep accumulating
citations for years because the notice never propagates to the people citing them. An
immutable, publicly readable retraction record that any citation tool can query is a real
contribution.

### Reviews

Review text goes to IPFS; its hash is anchored; the reviewer signs the attestation. Blind
review is supported by not revealing reviewer identity in the metadata while still anchoring
a commitment that can be opened later if needed.

---

## 9. Data model

Postgres. The relational shape SQLite cannot carry:

```
institutions      id, name, domain, signer_pubkey, settings, created_at
users             id, institution_id, email, orcid, display_name,
                  custodial_pubkey, self_custody_pubkey, created_at
roles             user_id, institution_id, role        -- author|reviewer|editor|admin
submissions       id, institution_id, corresponding_author_id, title,
                  discipline, language, visibility, current_version_id, doi
versions          id, submission_id, version_no, file_hash, cid, metadata_cid,
                  status, pda_address, anchor_signature, created_at
authors           version_id, user_id, ordinal, affiliation, is_corresponding
assignments       id, version_id, reviewer_id, state, due_at, assigned_at
reviews           id, assignment_id, review_cid, recommendation, signed_at,
                  anchor_signature, is_blind
similarity_runs   id, version_id, model, threshold, ran_at
similarity_hits   run_id, source_version_id, score, passage_span, matched_span
anchors           id, version_id, instruction, pda_address, signature,
                  slot, confirmed_at
retractions       version_id, reason_cid, retracted_by, retracted_at
```

`anchors` as a separate table matters: it is the local mirror of on-chain state, and any
divergence between it and the chain is an alarm worth paging on.

---

## 10. Discoverability

Non-negotiable for academic legitimacy.

**DOIs.** Register through DataCite or Crossref via a member institution. Put the DOI in the
metadata JSON alongside the CID. Without a DOI, a deposit does not count for promotion,
indexing, or citation, and the system stays a novelty regardless of how good the cryptography
is.

**OAI-PMH.** Expose an OAI-PMH endpoint so Google Scholar, BASE, CORE, and OpenAIRE can
harvest the catalogue. Discoverability is what makes depositing worthwhile to the author.
Nobody uploads to a repository nobody finds.

**ORCID.** Link author accounts to ORCID iDs. It is the identifier the rest of the academic
world already uses, and it solves author disambiguation for free.

**Schema.org / Dublin Core** metadata in the HTML head of every landing page.

---

## 11. Legal and policy

**Copyright.** Many papers are already assigned to publishers. Making every upload public
will produce takedown notices and will scare off exactly the senior faculty you need.
Support:

- Metadata-only records (catalogue entry, no full text)
- Embargo periods with automatic release
- Per-record licensing, defaulting to CC-BY but author-selectable
- A documented, findable takedown process

Content can be un-pinned and a record marked withdrawn even though the anchor remains. Be
explicit about this in the terms: the *proof that a document existed* is permanent; *access
to the document* is not.

**Governance.** Who decides what gets published, who can review, and who resolves disputes?
If the answer is "whoever runs the server," the decentralisation claim is thin. If the answer
is a DAO, you will spend a year on governance instead of building.

Recommended: a multi-institution consortium with a signed institutional registry on-chain,
and off-chain human editorial decisions made by each institution for its own submissions.
Document clearly which parts are decentralised and which are not.

---

## 12. Non-negotiables

- Free reads. No download fee, ever.
- Real IPFS replication, not a single Kubo node. A single node means the data dies with your
  server, which destroys the entire premise.
- Per-record licensing, embargo support, metadata-only option, documented takedown.
- Key recovery designed in from day one.
- No paper contents on-chain.
- The vector index must be rebuildable from IPFS plus the chain.

---

## 13. Build order

**Phase 1 — Repository.** Upload, metadata extraction, chunking, browse, search, landing
pages, DOI minting, OAI-PMH. It must be a genuinely good repository with the chain switched
off entirely. If it is not useful without the blockchain, the blockchain will not save it.

**Phase 2 — Anchoring.** The Anchor program, PDA derivation, the public verify page where
anyone drops a file and gets a yes/no plus the on-chain record. Migrate any memo-anchored
records.

**Phase 3 — Similarity engine.** Qdrant, self-hosted embeddings, the abstraction layer,
plagiarism reports. This is your wedge into schools — ship it as early as Phase 3 allows.

**Phase 4 — Peer review.** Submission, editor assignment, reviewer matching, review
submission, decision, anchored attestations. Versioning and retraction included from the
start, not bolted on.

**Phase 5 — Federation.** Multi-institution, IPFS Cluster, cross-institution search,
portable reviewer reputation.

### Open decision

Single institution first with a clean federation path, or consortium from day one? It changes
the auth model, governance design, and pinning topology significantly. Starting with one
institution and designing for federation is usually the faster route to something real.

---

## 14. Local development

```bash
# Qdrant
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage qdrant/qdrant

# Postgres
docker run -p 5432:5432 -e POSTGRES_PASSWORD=dev postgres:16
```

Dashboard at `http://localhost:6333/dashboard` for eyeballing stored vectors. Add both to
`run_server.sh` alongside the IPFS daemon and validator so the stack still comes up with one
command.

For unit tests, skip Docker. The Qdrant Python client has an embedded mode with the same API:

```python
QdrantClient(":memory:")           # tests
QdrantClient(path="./qdrant_dev")  # persisted local
```

**Dev embedding model:** `all-MiniLM-L6-v2` — 384 dims, ~80MB, CPU-fine, downloads in
seconds. Not good enough for production plagiarism detection, and that is the point: fast
iteration while building the pipeline, swap later.

**Production candidates:** `BAAI/bge-m3` (1024 dims, strong multilingual, long chunks) or
`intfloat/multilingual-e5-large`. Multilingual matters — an African repository will hold
French, Portuguese, Arabic, Swahili, and local-language material, and English-only models
handle those badly.

### Test corpus

Similarity thresholds are meaningless without real data. Pull a few hundred open-access PDFs
from arXiv, CORE, and AfricArXiv (the last is closest to your actual domain).

Then build a deliberate labelled fixture set. Take ten papers and for each produce:

1. A verbatim copy
2. A lightly paraphrased version
3. A version with one section swapped in from another paper
4. An unrelated paper in the same field

That gives labelled positives and negatives to tune against, and it is the only honest way to
answer "how many false accusations does this make." Getting that wrong in a plagiarism tool
is worse than missing detections — a false accusation can end a student's career.

### Proposed layout

```
backend/ai-engine/src/vectored/
  embeddings/
    base.py          Embedder protocol
    local.py         sentence-transformers
    groq.py          Groq API
    fake.py          deterministic, for tests
  store/
    base.py          VectorStore protocol
    qdrant.py
  chunking.py        write this first, with tests
  similarity.py      plagiarism scoring and passage grouping
  matching.py        reviewer matching
  config.py          factory reading env
  vector_service.py  FastAPI surface
```

---

## 15. Production best practices

### Storage durability

Pinning is not permanence. A single Kubo node means the data dies with your server. Run three
independent layers:

1. **IPFS Cluster across participating institutions.** Each university pins its own content
   and its peers'. This is also a good reason for them to join — mutual insurance.
2. **A commercial pinning service** as a baseline (Pinata, web3.storage, or similar) so
   availability does not depend on university uptime.
3. **Filecoin or Arweave deals** for long-term archival of the material that matters most:
   published papers, retractions, review records.

Run a monthly integrity job: for every record, fetch the CID, re-hash the bytes, compare
against the on-chain hash. Alert on any mismatch or any unretrievable CID. This is the single
most important background job in the system. Report the results publicly — a preservation
service that publishes its own audit results is far more credible than one that asserts
durability.

### Chain operations

- **Confirmation handling.** Do not treat a submitted transaction as anchored. Wait for
  finalised commitment, persist the slot, and reconcile. A record whose `anchors` row exists
  but whose transaction never finalised is a lie in your database.
- **Idempotency.** PDA creation must be retry-safe. Deriving the same address twice and
  getting "already initialised" is the correct, expected outcome of a retry, not an error.
- **Fee payer separation.** A dedicated fee-payer keypair, funded and monitored, with alerts
  at a balance threshold. Never the same key that has authority over anything else.
- **Key management.** Signer keys in a KMS or HSM, never in env vars or on disk in
  production. `SOLANA_KEYPAIR_PATH` is a development affordance and should not survive into
  production configuration.
- **Batching.** At volume, batch multiple anchor instructions per transaction. Solana
  transactions fit several instructions and this cuts cost proportionally.
- **RPC redundancy.** Use a paid RPC provider with a second provider configured as failover.
  Public endpoints will rate-limit you at exactly the wrong moment.
- **Reconciliation job.** Nightly, walk the `anchors` table and confirm each signature still
  resolves on-chain and matches local state. Divergence is an alarm.

### The similarity engine in production

- **Never auto-reject.** Similarity scores are evidence for a human editor, not a verdict.
  Publish the threshold and the model version alongside every report so results are
  contestable.
- **Exclude the expected matches.** References sections, standard methods boilerplate,
  institutional templates, and the author's own prior versions all produce high scores that
  mean nothing. Filter them before the editor sees the report or the report becomes noise
  they learn to ignore.
- **Show the passages, not just the number.** "37% similar" is useless. A side-by-side of the
  matched text with the source paper linked is actionable.
- **Version the reports.** Store which model and threshold produced each run. A paper cleared
  under an old model may look different under a new one, and you need to be able to explain
  why.
- **Rate-limit the corpus queries.** A single long paper produces hundreds of chunk queries.
  Batch them and cap concurrent similarity runs.

### Security

- Validate uploads by content sniffing, not by extension or client-supplied MIME type.
- Scan uploads for malware before pinning. Once a CID is published it is effectively
  permanent and you cannot recall it.
- Strip or flag PDF JavaScript and embedded executables.
- Cap upload size and page count; reject pathological PDFs (zip bombs, deeply nested objects).
- Rate-limit by account and by IP, especially on verify and search endpoints.
- Rotate custodial encryption keys on a schedule with a documented re-encryption procedure.
- Full audit log of every editorial action: who assigned, who decided, who retracted, when.
- Signed, immutable log storage separate from the application database.

### Observability

Track from day one:

- Time from upload to anchored, split by stage (extract, embed, pin, anchor, confirm)
- Anchor confirmation failure rate
- IPFS retrieval success rate and p95 latency by gateway
- Similarity run duration and queue depth
- Vector search p95 latency
- Reconciliation divergence count (should be zero; alert on one)
- Embedding model and dimension currently live in each collection

Structured JSON logs with a request ID threaded from the frontend through Rust and Python.
OpenTelemetry traces across the two services. A public status page.

### Operational discipline

- Postgres backups: point-in-time recovery, tested restores on a schedule. An untested backup
  is not a backup.
- The Qdrant rebuild job is your disaster recovery for the vector layer. Run it quarterly
  against a scratch instance to prove it still works.
- Blue/green or rolling deploys for the Rust and Python services.
- The Anchor program is upgradeable at first; move the upgrade authority to a multisig before
  any real institution deposits anything, and publish the program hash.
- Database migrations forward-only and reversible in effect (add column, backfill, switch,
  drop later) rather than destructive in one step.

---

## 16. Scaling

### The path, roughly

**One institution, thousands of documents.** Everything on one box. Postgres, Qdrant, Kubo,
Rust, Python, all colocated. This is fine and will stay fine longer than you expect.

**A handful of institutions, hundreds of thousands of documents.** Split the services.
Postgres to a managed instance with a read replica. Qdrant on its own host with more RAM.
Move ingestion (extract, chunk, embed, pin, anchor) off the request path into a job queue —
Redis plus RQ, or NATS if you want something more durable. This is the single most important
architectural change and it should happen earlier than strictly necessary, because an upload
that blocks on IPFS and Solana will produce timeouts and duplicate submissions.

**Consortium scale, millions of documents.** Now the specifics matter:

- **Qdrant sharding and replication.** Shard by institution or by discipline. Institution
  sharding keeps the common case (search within my university) on one shard; discipline
  sharding is better for cross-institution similarity. Given plagiarism detection must query
  the *whole* corpus, discipline sharding with a fan-out query is usually the better trade.
- **Quantisation.** Scalar or binary quantisation cuts memory 4–32x with modest recall loss.
  At millions of vectors this is the difference between one machine and a cluster. Measure
  recall on your labelled fixture set before and after.
- **Two-stage retrieval.** Fast approximate search over quantised vectors to get a candidate
  set, then exact rescoring on full-precision vectors for the top few hundred. Standard
  practice and it recovers most of the recall lost to quantisation.
- **Postgres partitioning.** Partition `versions`, `similarity_hits`, and `anchors` by
  institution or by time. `similarity_hits` grows fastest and is the first table that will
  hurt.
- **Read replicas** for search and browse traffic, primary for writes only.
- **CDN in front of IPFS gateways** for published, non-embargoed content. Most reads are for
  a small number of popular papers and should never touch a Kubo node.

### Ingestion pipeline at scale

Ingestion is embarrassingly parallel and should be structured that way:

```
upload → queue → [extract text] → [chunk] → [embed batch] → [upsert vectors]
                                          → [pin to IPFS]  → [anchor on chain]
                                          → [similarity run] → [notify editor]
```

Each stage is a separate worker pool that can scale independently. Embedding is
GPU-benefiting and batches well — one GPU worker will outrun ten CPU workers, so this is
where hardware money goes first. Anchoring is network-bound and cheap to parallelise but
should be rate-limited to respect RPC quotas.

Make every stage idempotent and keyed on content hash. Reprocessing the same document must
be a no-op, because you will reprocess documents: after model upgrades, after failed runs,
after bugs.

### Re-embedding the corpus

You will change embedding models. Plan the migration now:

1. Create the new collection under its model-suffixed name.
2. Backfill from stored text (keep extracted text in object storage — re-extracting from PDFs
   for millions of documents is far slower than re-embedding).
3. Run both collections in parallel; compare results on the labelled fixture set.
4. Flip the config value.
5. Retire the old collection after a grace period.

Storing extracted plain text alongside the PDF is the single decision that makes this
tractable. Do it from the first upload.

### Federation

Each institution runs its own node: its own Postgres, its own Qdrant, its own IPFS peer. A
shared institutional registry on-chain establishes which signers are legitimate.

Cross-institution search then federates: query each peer, merge and rerank locally. Slower
than a central index but it means no institution depends on another's uptime for its own
catalogue, and no single operator can be compelled to remove content from the network as a
whole. That is the version of decentralisation actually worth having here, and it is worth
more than any token.

Cross-institution plagiarism detection is harder, since it requires querying peers' indexes
over unpublished work. The workable version is a privacy-preserving similarity exchange:
peers exchange embeddings and hashes rather than text, so a match can be detected and flagged
for human follow-up without either side disclosing the manuscript. Design for it, but do not
build it before Phase 5.

### What will actually break first

In rough order of likelihood, based on the shape of this system:

1. IPFS retrieval latency and availability, long before anything else.
2. `similarity_hits` table growth.
3. Qdrant memory when the corpus outgrows one machine's RAM.
4. RPC rate limits during bulk ingestion of a legacy archive.
5. PDF text extraction quality on scanned material, which is not a scaling problem but will
   consume more of your time than all of the above combined.

Instrument the first four now. Budget real time for the fifth.
