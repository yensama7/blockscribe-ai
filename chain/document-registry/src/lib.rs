//! Blockscribe document registry (restructure.md §3).
//!
//! One PDA per document version, derived from the document's SHA-256:
//!
//!     seeds = [b"doc", &sha256_hash[..]]
//!
//! Verification is a single deterministic account fetch. Given only the
//! file, anyone derives the address and reads the record — no database, no
//! API, no cooperation from the operator. The chain holds hashes, CIDs and
//! state only; paper contents never go on-chain, and nothing is ever
//! deleted — corrections are new state, not edits.

use anchor_lang::prelude::*;

declare_id!("BScrbReg1stry1111111111111111111111111111111");

pub const MAX_CID_LEN: usize = 64;

#[program]
pub mod document_registry {
    use super::*;

    /// Uploader + institution sign. Creates the PDA with status `Submitted`.
    /// Retry-safe by construction: re-deriving the same address and hitting
    /// "already initialised" is the expected outcome of a retry, not an error.
    pub fn anchor_submission(
        ctx: Context<AnchorSubmission>,
        hash: [u8; 32],
        cid: String,
        metadata_cid: String,
        version: u16,
        previous: Option<Pubkey>,
    ) -> Result<()> {
        require!(cid.len() <= MAX_CID_LEN, RegistryError::CidTooLong);
        require!(metadata_cid.len() <= MAX_CID_LEN, RegistryError::CidTooLong);
        let record = &mut ctx.accounts.record;
        let now = Clock::get()?.unix_timestamp;
        record.hash = hash;
        record.cid = cid;
        record.metadata_cid = metadata_cid;
        record.uploader = ctx.accounts.uploader.key();
        record.institution = ctx.accounts.institution.key();
        record.created_at = now;
        record.updated_at = now;
        record.status = DocStatus::Submitted;
        record.version = version;
        record.previous = previous;
        record.review_count = 0;
        record.bump = ctx.bumps.record;
        Ok(())
    }

    pub fn set_under_review(ctx: Context<InstitutionUpdate>) -> Result<()> {
        transition(&mut ctx.accounts.record, DocStatus::UnderReview, &[DocStatus::Submitted])
    }

    /// Increments `review_count` and appends the review CID hash as an event.
    /// Blind review: the reviewer identity is a commitment, not a name.
    pub fn attach_review(ctx: Context<InstitutionUpdate>, review_hash: [u8; 32]) -> Result<()> {
        let record = &mut ctx.accounts.record;
        require!(
            matches!(record.status, DocStatus::Submitted | DocStatus::UnderReview),
            RegistryError::InvalidTransition
        );
        record.review_count = record.review_count.saturating_add(1);
        record.updated_at = Clock::get()?.unix_timestamp;
        emit!(ReviewAttached {
            document: record.key(),
            review_hash,
            review_count: record.review_count,
        });
        Ok(())
    }

    pub fn finalize_review(ctx: Context<InstitutionUpdate>) -> Result<()> {
        transition(
            &mut ctx.accounts.record,
            DocStatus::Reviewed,
            &[DocStatus::Submitted, DocStatus::UnderReview],
        )
    }

    pub fn publish(ctx: Context<InstitutionUpdate>) -> Result<()> {
        transition(
            &mut ctx.accounts.record,
            DocStatus::Published,
            &[DocStatus::Submitted, DocStatus::UnderReview, DocStatus::Reviewed],
        )
    }

    /// Append-only retraction: the record survives, the reason is pinned to
    /// IPFS and its CID recorded. Retraction notices become machine-readable
    /// by any citation tool that can read an account.
    pub fn retract(ctx: Context<InstitutionUpdate>, reason_cid: String) -> Result<()> {
        require!(reason_cid.len() <= MAX_CID_LEN, RegistryError::CidTooLong);
        let record = &mut ctx.accounts.record;
        record.status = DocStatus::Retracted;
        record.updated_at = Clock::get()?.unix_timestamp;
        emit!(Retracted { document: record.key(), reason_cid });
        Ok(())
    }

    /// Links forward to the PDA of the replacing version. The chain then
    /// holds the complete revision lineage.
    pub fn supersede(ctx: Context<InstitutionUpdate>, next: Pubkey) -> Result<()> {
        let record = &mut ctx.accounts.record;
        record.status = DocStatus::Superseded;
        record.updated_at = Clock::get()?.unix_timestamp;
        emit!(Superseded { document: record.key(), next });
        Ok(())
    }
}

fn transition(record: &mut Account<DocumentRecord>, to: DocStatus, from: &[DocStatus]) -> Result<()> {
    require!(from.contains(&record.status), RegistryError::InvalidTransition);
    record.status = to;
    record.updated_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
#[instruction(hash: [u8; 32])]
pub struct AnchorSubmission<'info> {
    #[account(
        init,
        payer = fee_payer,
        // 8 discriminator + fixed fields + two length-prefixed CID strings
        space = 8 + 32 + (4 + MAX_CID_LEN) * 2 + 32 + 32 + 8 + 8 + 1 + 2 + 33 + 1 + 1,
        seeds = [b"doc", hash.as_ref()],
        bump,
    )]
    pub record: Account<'info, DocumentRecord>,
    pub uploader: Signer<'info>,
    /// The registered institution signer authorises the deposit.
    pub institution: Signer<'info>,
    /// Rent is an operating cost carried by the institution, never the user.
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InstitutionUpdate<'info> {
    #[account(mut, has_one = institution @ RegistryError::WrongInstitution)]
    pub record: Account<'info, DocumentRecord>,
    pub institution: Signer<'info>,
}

#[account]
pub struct DocumentRecord {
    pub hash: [u8; 32],            // SHA-256 of the file
    pub cid: String,               // IPFS CID (content address)
    pub metadata_cid: String,      // IPFS CID of the metadata JSON
    pub uploader: Pubkey,          // author or custodial wallet
    pub institution: Pubkey,       // registered institution signer
    pub created_at: i64,
    pub updated_at: i64,
    pub status: DocStatus,
    pub version: u16,
    pub previous: Option<Pubkey>,  // PDA of the prior version
    pub review_count: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum DocStatus {
    Submitted,
    UnderReview,
    Reviewed,
    Published,
    Retracted,
    Superseded,
}

#[event]
pub struct ReviewAttached {
    pub document: Pubkey,
    pub review_hash: [u8; 32],
    pub review_count: u8,
}

#[event]
pub struct Retracted {
    pub document: Pubkey,
    pub reason_cid: String,
}

#[event]
pub struct Superseded {
    pub document: Pubkey,
    pub next: Pubkey,
}

#[error_code]
pub enum RegistryError {
    #[msg("status transition not allowed from the current state")]
    InvalidTransition,
    #[msg("CID exceeds maximum length")]
    CidTooLong,
    #[msg("signer is not this record's institution")]
    WrongInstitution,
}
