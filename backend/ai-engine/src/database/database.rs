// database.rs: Utilty functions for database integration and handling

use rusqlite::{Connection, Result};
use crate::nlp::engine::ExtractedMetaData;
use crate::nlp::engine::FileRecord;

// because of our lord and saviour: thoughtful developers we can write one function that does both:
// 1. creating the database
// 2. adding to the database


// please don't get angry at my naming conventions lmao ;)
pub fn add_to_or_create_database(metadata: &ExtractedMetaData, hash: &FileRecord, database_name: String) -> Result<(), Box<dyn std::error::Error>> {
    let conn = Connection::open(database_name)?;


    // if we dont have a database active; create one
    conn.execute(
        "CREATE TABLE IF NOT EXISTS archive (
            id INTEGER PRIMARY KEY,
            genre TEXT NOT NULL,
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            summary TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            file_cid TEXT NOT NULL
        )",
        (),
    )?;

    // Always insert a new row (duplicates allowed)
    conn.execute(
        "INSERT INTO archive
         (genre, title, difficulty, summary, file_hash, file_cid)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &metadata.genre,
            &metadata.title,
            &metadata.difficulty,
            &metadata.summary,
            &hash.file_hash,
            &hash.file_cid,
        ),
    )?;
    println!("Inserted new record.");

    // List all genres currently stored
    let mut stmt = conn.prepare("SELECT genre FROM archive")?;
    let genres_iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
    println!("All genres in DB:");
    for g in genres_iter {
        println!("  - {}", g?);
    }

    Ok(())
}
