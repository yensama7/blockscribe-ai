//! Postgres pool and schema (restructure.md §9).

use deadpool_postgres::{Config, Pool, Runtime};
use std::env;
use tokio_postgres::NoTls;

pub fn database_url() -> String {
    env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:dev@127.0.0.1:5432/postgres".to_string())
}

pub fn make_pool() -> anyhow::Result<Pool> {
    let url = database_url();
    let parsed: tokio_postgres::Config = url.parse()?;
    let mut cfg = Config::new();
    cfg.user = parsed.get_user().map(|s| s.to_string());
    cfg.password = parsed
        .get_password()
        .map(|p| String::from_utf8_lossy(p).to_string());
    cfg.dbname = parsed.get_dbname().map(|s| s.to_string());
    cfg.host = parsed.get_hosts().iter().find_map(|h| match h {
        tokio_postgres::config::Host::Tcp(s) => Some(s.clone()),
        #[allow(unreachable_patterns)]
        _ => None,
    });
    cfg.port = parsed.get_ports().first().copied();
    Ok(cfg.create_pool(Some(Runtime::Tokio1), NoTls)?)
}

/// Forward-only, idempotent schema. Migration tooling can replace this once
/// there is more than one deployment.
pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS institutions (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT '',
    signer_pubkey TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    institution_id UUID REFERENCES institutions(id),
    email TEXT NOT NULL UNIQUE,
    orcid TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'author',
    custodial_pubkey TEXT NOT NULL DEFAULT '',
    custodial_secret BYTEA,
    self_custody_pubkey TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY,
    institution_id UUID REFERENCES institutions(id),
    corresponding_author_id UUID REFERENCES users(id),
    title TEXT NOT NULL,
    discipline TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    visibility TEXT NOT NULL DEFAULT 'public',
    license TEXT NOT NULL DEFAULT 'CC-BY-4.0',
    embargo_until DATE,
    doi TEXT NOT NULL DEFAULT '',
    authors TEXT NOT NULL DEFAULT '',
    abstract_text TEXT NOT NULL DEFAULT '',
    keywords TEXT NOT NULL DEFAULT '',
    current_version_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS versions (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL REFERENCES submissions(id),
    version_no INT NOT NULL DEFAULT 1,
    file_hash TEXT NOT NULL,
    cid TEXT NOT NULL DEFAULT '',
    metadata_cid TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'submitted',
    pda_address TEXT NOT NULL DEFAULT '',
    previous_version_id UUID,
    extracted_text TEXT NOT NULL DEFAULT '',
    original_filename TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_file_hash ON versions(file_hash);

CREATE TABLE IF NOT EXISTS assignments (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL REFERENCES versions(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    state TEXT NOT NULL DEFAULT 'assigned',
    due_at DATE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY,
    assignment_id UUID NOT NULL REFERENCES assignments(id),
    review_cid TEXT NOT NULL DEFAULT '',
    review_hash TEXT NOT NULL DEFAULT '',
    review_text TEXT NOT NULL DEFAULT '',
    recommendation TEXT NOT NULL DEFAULT '',
    reviewer_signature TEXT NOT NULL DEFAULT '',
    anchor_signature TEXT NOT NULL DEFAULT '',
    is_blind BOOLEAN NOT NULL DEFAULT true,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS similarity_runs (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL REFERENCES versions(id),
    model TEXT NOT NULL,
    threshold REAL NOT NULL,
    max_score REAL NOT NULL DEFAULT 0,
    flagged_chunks INT NOT NULL DEFAULT 0,
    total_chunks INT NOT NULL DEFAULT 0,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS anchors (
    id UUID PRIMARY KEY,
    version_id UUID NOT NULL REFERENCES versions(id),
    instruction TEXT NOT NULL,
    pda_address TEXT NOT NULL DEFAULT '',
    signature TEXT NOT NULL DEFAULT '',
    slot BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    memo JSONB NOT NULL DEFAULT '{}'::jsonb,
    confirmed_at TIMESTAMPTZ
);
ALTER TABLE anchors ADD COLUMN IF NOT EXISTS memo JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS retractions (
    version_id UUID PRIMARY KEY REFERENCES versions(id),
    reason TEXT NOT NULL DEFAULT '',
    reason_cid TEXT NOT NULL DEFAULT '',
    retracted_by UUID REFERENCES users(id),
    retracted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"#;

pub async fn ensure_schema(pool: &Pool) -> anyhow::Result<()> {
    let client = pool.get().await?;
    client.batch_execute(SCHEMA).await?;
    Ok(())
}
