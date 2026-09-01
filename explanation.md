# Blockscribe, explained simply

This document explains what Blockscribe is, why it exists, and exactly how to
show it to an audience. No technical background needed.

---

## 1. What is Blockscribe?

Blockscribe is a **digital library for university research that cannot lose
things and cannot be lied to.**

Think of it as three promises:

1. **Your work is kept safe forever.** Not on one computer in one office —
   copies live on a shared network, so no single crash, fire, or forgotten
   password can erase decades of research.
2. **You can prove your work is yours.** The moment you deposit a paper, a
   permanent, tamper-proof record is created: *this exact document existed on
   this date, deposited by this person.* Nobody — not even us — can fake it,
   backdate it, or delete it.
3. **Copying gets caught.** Every new paper is automatically compared against
   everything already in the library. If someone submits work that copies an
   existing paper, the editor sees the matching passages side by side.

One sentence for the stage:

> **"Blockscribe is preservation infrastructure that happens to use a
> blockchain — not a blockchain project that happens to store papers."**

## 2. Why does this matter?

In many universities, a thesis exists as **one PDF on one computer in one
department office**. When that server dies, or the one person who maintained it
leaves, the research is simply gone. On top of that:

- Plagiarism-checking services cost more than most institutions can afford.
- When two researchers argue "I had this result first," there is no neutral referee.
- Papers that get retracted (officially withdrawn for errors or fraud) keep
  getting cited for years, because the retraction notice never reaches readers.
- Peer reviewers do hours of invisible, unrewarded work with nothing to show for it.

Blockscribe addresses all four with one system.

## 3. How it works, in plain words

When a researcher deposits a paper, five things happen automatically, in about
ten seconds:

1. **Fingerprint.** The file gets a unique fingerprint (a "hash"). Change even
   one letter in the document and the fingerprint changes completely.
2. **Reading.** The system reads the paper and fills in the title, authors,
   summary, and subject on its own.
3. **Copy check.** The full text is compared, meaning-by-meaning (not just
   word-by-word), against every paper already in the library. Matches are
   flagged for a human editor — the system never accuses anyone on its own.
4. **Safe storage.** The file is copied onto IPFS, a network where files are
   found by their fingerprint, not by which computer holds them.
5. **The permanent receipt.** The fingerprint is written onto the Solana
   blockchain — a public ledger that nobody can edit or erase. That's the
   proof of "this existed, on this date, deposited by this account."

The researcher does **none** of this manually. They click "Deposit" and get a
receipt.

**Important:** nobody needs a crypto wallet, tokens, or any blockchain
knowledge. People sign in with an email address. The cryptographic keys are
created and looked after behind the scenes by the institution. And **reading
papers is free — always.** There is no fee anywhere for readers.

## 4. What each page does

| Page | What it shows |
|------|---------------|
| **Home** | The pitch, live counts (papers, anchors, reviews), and live health lights for each part of the system |
| **Browse** | The archive, with search that understands meaning ("drought farming" finds a maize irrigation paper) |
| **Deposit** | Upload form. Choose open access, embargo (hidden until a date), or metadata-only |
| **Paper page** | Title, abstract, DOI, status, full version history, on-chain receipts, signed reviews, related papers |
| **Verify** | The showpiece. Anyone drops in a file and gets a YES or NO — no account needed |
| **Review** | Editors: waiting submissions, similarity reports, reviewer matching. Reviewers: write and sign reviews |
| **Account** | Your profile and deposits, plus your custodial signing address (which you never have to manage) |

## 5. Running the demo

Before you present:

```bash
docker compose up -d postgres qdrant ipfs solana      # the infrastructure

# terminal 2 — the similarity engine
cd backend/ai-engine/src/vectored
../../.venv/Scripts/python vector_service.py

# terminal 3 — the main server
cd backend/ai-engine
cargo run

# terminal 4 — the website
npm run dev
```

Then open **http://localhost:8081**. Give everything ~20 seconds, and check
that all four status lights on the Home page are green.

**To wipe all demo data and start fresh** (do this before every rehearsal):

```bash
docker compose down -v && docker compose up -d postgres qdrant ipfs solana
```

then restart the main server. The first email that signs in becomes the editor
again.

**Quickest setup — seed ready-made accounts and data** (after the stack is up):

```bash
bash backend/seed_demo.sh
```

This creates three sign-in accounts (email only, no password) and pre-loads two
papers and one review assignment so every screen has something to show:

- **editor@demo.edu** — the editor. Editorial desk, publish, retract.
- **reviewer@demo.edu** — has a review waiting under *Review → My review assignments*.
- **author@demo.edu** — owns the deposited papers; open one to *Request a review*.

**If a deposit shows "anchor unanchored":** the local blockchain container
sometimes wedges after the laptop sleeps. Recreate it and heal the records:

```bash
docker compose rm -sf solana && docker compose up -d solana
```

then, signed in as the editor, call the reconciliation endpoint (or just click
around — new deposits will anchor fine):

```bash
curl -X POST http://127.0.0.1:5000/api/admin/reanchor -H "Authorization: Bearer <your token>" -H "Content-Type: application/json" -d "{}"
```

*If the similarity engine's real language model isn't installed
(`pip install sentence-transformers` needs a good connection), you can still run
the full demo with the deterministic test embedder:* start the vector service
with `EMBEDDING_PROVIDER=fake EMBEDDING_DIM=64`. Copy-detection still works
perfectly; semantic search is just less clever.

## 6. The demo script (follow this on stage)

Have ready: two or three PDFs of real papers, plus a copy of one of them with
a different filename.

**Beat 1 — Deposit (2 min).**
Sign in with any email (the first sign-in becomes the editor — do that one
yourself before the demo). Go to **Deposit**, upload a paper, leave title blank.
Point out: the system read the paper and extracted the metadata itself. Show the
receipt: fingerprint, IPFS address, on-chain anchor "confirmed."
Say: *"That was a permanent, tamper-proof timestamp. No wallet, no crypto
knowledge, no fee."*

**Beat 2 — Verify, the magic trick (2 min).**
Go to **Verify**. Drop the same PDF → big green YES with the deposit date and
author. Now open the copy of the PDF, change one word, save, drop it → **NO**.
Say: *"One changed word, completely different fingerprint. This is how a
student, a journal, or a court can check a document without trusting us at all.
The address it checks is computed from the file itself — even if our servers
disappeared, the proof survives."*

**Beat 3 — Catching a copy (2 min).**
Sign out. Sign in as a second email ("the copying student"). Deposit the
renamed **exact copy** — it is refused: this file is already in the archive.
Now deposit a *modified* copy (a few words changed) — it goes through, but the
receipt shows **similarity flagged**. Sign back in as the editor, open the
paper, and show the **side-by-side matched passages**.
Say: *"Commercial plagiarism screening costs more than most departments can
afford. This is built in, it checks meaning rather than exact words, and the
final call always belongs to a human editor."*

**Beat 3.5 — Self-check before submitting (30 sec, optional).**
Open **Check** in the nav and drop a draft. It runs the very same similarity
screen an editor would see, but stores nothing — no deposit, no record.
Say: *"Honest authors can screen their own work before submitting, so they fix
an accidental overlap before it ever becomes part of the permanent record."*

**Beat 4 — Peer review with proof (2 min).**
Point out that when the paper was deposited, the system **already assigned
reviewers automatically** — matched by expertise (from what they've actually
published), the author excluded. That's not the editor's job; the editor can
*add* a reviewer for a second opinion. Sign in as the reviewer, write a short
review, submit. Show on the paper page: the review is there, signed and
anchored. Note that the paper only becomes *reviewed* once **every** assigned
reviewer has responded (or after a set number of days, so one silent reviewer
can't stall it forever).
Say: *"Review work is normally invisible. Here every review is a signed,
dated, permanent record — reviewers finally have provable credit, and readers
can see that review really happened."*

**Conflict of interest to call out:** if an editor deposits their own paper,
the system won't let them publish or retract it — another editor has to make
that call. The evidence trail is neutral by construction.

**Beat 5 — Publish and retract (1 min).**
As editor, publish the paper — status changes, anchored. Then retract the
copied paper with a reason. Show the red banner.
Say: *"You can't delete history from the ledger, and that's the point: today,
retracted papers keep collecting citations for years because nobody hears
about the retraction. Here the retraction is a permanent public record any
citation tool can read."*

**Optional closer:** Home page — point at the live status lights and the
counts. *"And everything you just saw is checkable by anyone, forever."*

## 7. Honesty section — what's real and what's simplified

We tell audiences the truth about which parts are trustless and which are not.

**Real, working now:**
- Fingerprinting, IPFS storage, on-chain anchoring with confirmations
- Meaning-based similarity screening and search (runs on our own servers —
  unpublished manuscripts never leave the institution)
- An optional pre-deposit originality **Check** that stores nothing
- The whole review lifecycle with signed, anchored reviews: reviewers are
  auto-assigned by expertise on deposit, a paper is only "reviewed" once all of
  them respond (with a timeout so one silent reviewer can't stall it), and an
  editor can never rule on their own submission
- Authors and editors can add extra reviewers (an author can ask a colleague to review their work)
- Version history, embargoes, metadata-only records, retraction
- OAI-PMH feed (the standard that lets Google Scholar index a repository) and
  Dublin Core metadata on every paper page
- Upload validation by content, with active-content PDFs (JavaScript/launch)
  rejected before anything is pinned
- Deposit stays responsive: the paper and its similarity report come back in a
  couple of seconds while the search index and the on-chain anchor finish in the
  background (the receipt updates to "confirmed" a moment later)

**Simplified for the demo (with the production path designed):**
- Sign-in trusts the typed email; production uses university single-sign-on or
  emailed magic links.
- Signing keys are stored unencrypted in the demo database; production wraps
  them with a hardware-backed key service. (Keys are custodial on purpose —
  researchers lose keys, and a repository that loses your proof because you
  reinstalled a browser is worse than no repository.)
- DOIs use the reserved test prefix (10.5555); production registers real DOIs
  through DataCite.
- The chain runs locally; production uses Solana mainnet plus a small dedicated
  program (already written, in `chain/document-registry/`) so verification is
  one direct lookup with no database anywhere in the trust path.
- One IPFS node; production is a pinning cluster across member universities —
  each keeps copies of the others' archives, mutual insurance.
- Editorial decisions are human and institutional. We do not claim they are
  decentralised. The *evidence* is what nobody can tamper with.

**Deliberately left for later (from the design doc, not needed to demo):**
- Federation across many universities with cross-institution search (Phase 5).
- Optional self-custody: power users connecting their own wallet instead of the
  managed key.
- A full malware-scanning engine on uploads (we validate content and block
  active-content PDFs today; ClamAV slots in at the same boundary).
- Rate limiting and a dedicated audit-log store for very high traffic.

Everything else in `restructure.md` — the repository, content-addressed
anchoring, the similarity engine, and the peer-review workflow — is built and
testable in this demo.

## 8. Frequently asked questions

**Do users need to buy or understand cryptocurrency?**
No. Nobody sees a wallet, a token, or a seed phrase. The institution's account
pays the anchoring cost — fractions of a cent per document.

**What does it cost to run?**
A modest server per institution plus fractions of a cent per deposit. Revenue,
if any, comes from institutional subscriptions for hosting and screening —
never from readers.

**What happens if Blockscribe the company/server disappears?**
The files live on a shared storage network and the proofs live on a public
ledger. Both outlive any single operator — that is the entire design goal.

**Can something be removed if it must be (copyright, legal)?**
Yes. The file can be unpinned so it is no longer served, and the record marked
withdrawn. What remains permanent is only the *proof that the document
existed* — not access to it.

**Can the similarity checker falsely accuse someone?**
It never accuses. It shows a human editor the matching passages, the score,
and which model produced them. Thresholds are published, results are
contestable, and reference sections are excluded so routine citations don't
trigger noise.

**Why a blockchain at all?**
Only for the two things it is genuinely good at: timestamps nobody can forge
and records nobody can quietly edit (priority claims and retractions). All the
heavy things — papers, reviews, search — deliberately live off-chain.
