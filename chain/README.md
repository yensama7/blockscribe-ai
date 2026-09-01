# On-chain document registry (Phase 2)

`document-registry/` is the Anchor program described in `restructure.md` §3:
one PDA per document version, derived from the document's SHA-256
(`seeds = [b"doc", hash]`), holding hash, CIDs, status, version lineage and
review count. Verification is a single account fetch — no database in the
trust path.

## Current state

The backend already derives the exact PDA address for every deposit
(`backend/ai-engine/src/chain.rs::derive_document_pda`) and shows it on the
verify page, but anchors via the SPL Memo program until this program is
deployed. Memo anchors carry the same payload (`instr`, `hash`, `cid`,
`meta_cid`, `pda`) signed by the institution fee payer, so every record's
future account address is already committed on-chain.

## Deploying (requires the Solana + Anchor toolchains, not included here)

```bash
# in an environment with solana-cli and anchor-cli installed:
cd chain/document-registry
anchor build
anchor deploy                       # note the new program id
```

Then:
1. Replace `declare_id!` here and `DOCUMENT_REGISTRY_ID` in
   `backend/ai-engine/src/chain.rs` with the deployed id.
2. Move the upgrade authority to a multisig before any real institution
   deposits anything, and publish the program hash (restructure.md §15).
