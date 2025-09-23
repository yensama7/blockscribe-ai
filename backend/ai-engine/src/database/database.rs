use sqlx::{Pool, Sqlite};
use nlp::engine::ExtractedMetaData;

// create database connection
pub async fn init_database() -> Pool<Sqlite> {
    let pool = Pool::<Sqlite>::connect("sqlite:://metadata.db").await.expect("database connection failed.");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS extracted_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            genre TEXT NOT NULL,
            summary TEXT NOT NULL
        );
        "#,
    )
        .execute(&pool)
    .await
        .unwrap();

    pool
}


// function to create_metadata
pub async fn create_metadata(
    pool: &Pool<Sqlite>,
    title: &str,
    difficulty: &str,
    genre: &str,
    summary: &str,
) -> i64
{
    let rec = sqlx::query!(
        r#"
        INSERT INTO extracted_metadata (title, difficulty, genre, summary)
        VALUES (?1, ?2, ?3, ?4)
        "#,
        title,
        difficulty,
        genre,
        summary
    )
        .execute(pool)
        .await
        .unwrap();

    rec.last_insert_rowid()
}

// Read (fetch all)
pub async fn get_all_metadata(pool: &Pool<Sqlite>) -> Vec<ExtractedMetaData> {
    let rows = sqlx::query!(
        r#"
        SELECT id, title, difficulty, genre, summary
        FROM extracted_metadata
        "#
    )
        .fetch_all(pool)
        .await
        .unwrap();

    rows.into_iter()
        .map(|r| ExtractedMetaData {
            id: r.id,
            title: r.title,
            difficulty: r.difficulty,
            genre: r.genre,
            summary: r.summary,
        })
        .collect()
}


// Fetch all metadata where a given field matches a value.
//
// `field` can be "title", "difficulty", "genre", or "summary".
pub async fn get_metadata_by_field(
    pool: &Pool<Sqlite>,
    field: &str,
    value: &str,
) -> Vec<ExtractedMetaData> {
    // Validate allowed fields (to avoid SQL injection!)
    let column = match field {
        "title" => "title",
        "difficulty" => "difficulty",
        "genre" => "genre",
        "summary" => "summary",
        _ => panic!("Invalid field: {}", field),
    };

    // Dynamic SQL with column substitution (safe because column is validated above)
    let query = format!(
        "SELECT id, title, difficulty, genre, summary
         FROM extracted_metadata
         WHERE {} = ?1",
        column
    );

    let rows = sqlx::query_as::<_, ExtractedMetaData>(&query)
        .bind(value)
        .fetch_all(pool)
        .await
        .unwrap();

    rows
}
