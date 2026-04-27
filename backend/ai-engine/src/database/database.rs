use crate::nlp::engine::{ExtractedMetaData, FileRecord};
use rusqlite::{Connection, Result};

fn archive_has_column(conn: &Connection, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare("PRAGMA table_info(archive)")?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for item in columns {
        if item? == column {
            return Ok(true);
        }
    }
    Ok(false)
}


pub fn ensure_archive_schema(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS archive (
            id INTEGER PRIMARY KEY,
            genre TEXT NOT NULL,
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            summary TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            file_cid TEXT NOT NULL,
            uploader_wallet TEXT,
            solana_signature TEXT,
            access_type TEXT NOT NULL DEFAULT 'open',
            publish_fee_lamports INTEGER NOT NULL DEFAULT 1000,
            search_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        (),
    )?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_file_hash ON archive(file_hash)",
        (),
    )?;

    if !archive_has_column(conn, "uploader_wallet")? {
        conn.execute("ALTER TABLE archive ADD COLUMN uploader_wallet TEXT", ())?;
    }
    if !archive_has_column(conn, "solana_signature")? {
        conn.execute("ALTER TABLE archive ADD COLUMN solana_signature TEXT", ())?;
    }
    if !archive_has_column(conn, "access_type")? {
        conn.execute("ALTER TABLE archive ADD COLUMN access_type TEXT", ())?;
    }
    if !archive_has_column(conn, "publish_fee_lamports")? {
        conn.execute("ALTER TABLE archive ADD COLUMN publish_fee_lamports INTEGER", ())?;
    }
    if !archive_has_column(conn, "search_count")? {
        conn.execute("ALTER TABLE archive ADD COLUMN search_count INTEGER", ())?;
    }
    if !archive_has_column(conn, "created_at")? {
        conn.execute("ALTER TABLE archive ADD COLUMN created_at TEXT", ())?;
    }

    conn.execute(
        "UPDATE archive
         SET access_type = COALESCE(access_type, 'open'),
             publish_fee_lamports = COALESCE(publish_fee_lamports, 1000),
             search_count = COALESCE(search_count, 0),
             created_at = COALESCE(created_at, CURRENT_TIMESTAMP)",
        (),
    )?;

    Ok(())
}

pub fn add_to_or_create_database(
    metadata: &ExtractedMetaData,
    hash: &FileRecord,
    uploader_wallet: &str,
    solana_signature: &str,
    database_name: String,
) -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open(database_name)?;
    ensure_archive_schema(&conn)?;

    conn.execute(
        "INSERT OR REPLACE INTO archive
         (id, genre, title, difficulty, summary, file_hash, file_cid, uploader_wallet, solana_signature)
         VALUES (
            (SELECT id FROM archive WHERE file_hash = ?5),
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
         )",
        (
            &metadata.genre,
            &metadata.title,
            &metadata.difficulty,
            &metadata.summary,
            &hash.file_hash,
            &hash.file_cid,
            uploader_wallet,
            solana_signature,
        ),
    )?;

    Ok(())
}
