use actix_cors::Cors;
use actix_multipart::Multipart;
use actix_web::{get, http, post, web, App, Error, HttpResponse, HttpServer, Responder};
use futures_util::StreamExt;
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use sanitize_filename::sanitize;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::env;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use ai_engine::{
    add_to_or_create_database, ensure_archive_schema, get_meta_data_response, package_hash_and_cid, ExtractedMetaData,
    FileRecord,
};

fn log_backend_error(context: &str, error: &str) {
    eprintln!("[backend-error] {}: {}", context, error);
}

fn db_path() -> String {
    env::var("DB_PATH").unwrap_or_else(|_| "archive.db".to_string())
}

fn python_engine_base() -> String {
    env::var("PYTHON_ENGINE_URL").unwrap_or_else(|_| "http://127.0.0.1:8001".to_string())
}

fn open_archive_db() -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path())?;
    ensure_archive_schema(&conn)?;
    Ok(conn)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArchiveRecord {
    id: i64,
    genre: String,
    title: String,
    difficulty: String,
    summary: String,
    file_hash: String,
    file_cid: String,
    uploader_wallet: Option<String>,
    solana_signature: Option<String>,
    access_type: String,
    publish_fee_lamports: i64,
    search_count: i64,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct LibraryHighlightsResponse {
    top_searched: Vec<ArchiveRecord>,
    recent: Vec<ArchiveRecord>,
    random: Vec<ArchiveRecord>,
}

#[derive(Debug, Deserialize)]
struct VectorSearchRequest {
    query: String,
    k: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug)]
struct VectorSearchResult {
    id: Vec<Vec<String>>,
    documents: Vec<Vec<String>>,
    metadatas: Vec<Vec<Value>>,
    distances: Vec<Vec<f32>>,
}

#[derive(Debug, Serialize)]
struct IntegrityCheckResponse {
    exists: bool,
    matches_on_chain: bool,
    record: Option<ArchiveRecord>,
}

#[derive(Debug, Deserialize)]
struct DownloadFeeRequest {
    record_id: i64,
    downloader_wallet: String,
}

#[derive(Debug, Deserialize)]
struct UploadSignatureRequest {
    file_hash: String,
    solana_signature: String,
    uploader_wallet: String,
}

#[derive(Debug, Deserialize)]
struct WalletMetadataQuery {
    wallet: String,
}

#[derive(Debug, Deserialize)]
struct ChatQuery {
    author_wallet: String,
    reader_wallet: String,
}

#[derive(Debug, Deserialize)]
struct ChatMessageCreate {
    author_wallet: String,
    reader_wallet: String,
    sender_wallet: String,
    message: String,
}

#[derive(Debug, Serialize)]
struct ChatMessage {
    id: i64,
    author_wallet: String,
    reader_wallet: String,
    sender_wallet: String,
    message: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct DownloadFeeResponse {
    settled: bool,
    amount_lamports_total: u64,
    amount_lamports_uploader: u64,
    amount_lamports_developer: u64,
    uploader_wallet: Option<String>,
    developer_wallet: String,
}

#[get("/")]
async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello world!")
}

#[get("/metadata")]
async fn list_all() -> impl Responder {
    let res = web::block(move || -> Result<Vec<Vec<String>>, rusqlite::Error> {
        let conn = open_archive_db()?;
        let mut stmt = conn.prepare(
            "SELECT id, genre, title, difficulty, summary, file_hash, file_cid, COALESCE(uploader_wallet, ''), COALESCE(solana_signature, ''), COALESCE(access_type, 'open'), COALESCE(publish_fee_lamports, 1000), COALESCE(search_count, 0), COALESCE(created_at, '') FROM archive ORDER BY id DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(vec![
                row.get::<_, i64>(0)?.to_string(),
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                format!("{}|{}", row.get::<_, String>(5)?, row.get::<_, String>(6)?),
                row.get(7)?,
                row.get(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, i64>(10)?.to_string(),
                row.get::<_, i64>(11)?.to_string(),
                row.get::<_, String>(12)?,
            ])
        })?;

        Ok(rows.flatten().collect())
    })
    .await;

    match res {
        Ok(Ok(rows)) => HttpResponse::Ok().json(rows),
        Ok(Err(e)) => { log_backend_error("/metadata db", &e.to_string()); HttpResponse::InternalServerError().body(format!("db error: {}", e)) },
        Err(e) => { log_backend_error("/metadata blocking", &e.to_string()); HttpResponse::InternalServerError().body(format!("blocking error: {}", e)) },
    }
}

#[get("/metadata/by-wallet")]
async fn list_by_wallet(query: web::Query<WalletMetadataQuery>) -> impl Responder {
    let wallet = query.wallet.trim().to_string();
    if wallet.is_empty() {
        return HttpResponse::BadRequest().body("wallet query param is required");
    }

    let res = web::block(move || -> Result<Vec<Vec<String>>, rusqlite::Error> {
        let conn = open_archive_db()?;
        let mut stmt = conn.prepare(
            "SELECT id, genre, title, difficulty, summary, file_hash, file_cid, COALESCE(uploader_wallet, ''), COALESCE(solana_signature, ''), COALESCE(access_type, 'open'), COALESCE(publish_fee_lamports, 1000), COALESCE(search_count, 0), COALESCE(created_at, '') FROM archive WHERE COALESCE(uploader_wallet, '') = ?1 ORDER BY id DESC",
        )?;

        let rows = stmt.query_map([wallet], |row| {
            Ok(vec![
                row.get::<_, i64>(0)?.to_string(),
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                format!("{}|{}", row.get::<_, String>(5)?, row.get::<_, String>(6)?),
                row.get(7)?,
                row.get(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, i64>(10)?.to_string(),
                row.get::<_, i64>(11)?.to_string(),
                row.get::<_, String>(12)?,
            ])
        })?;
        Ok(rows.flatten().collect())
    })
    .await;

    match res {
        Ok(Ok(rows)) => HttpResponse::Ok().json(rows),
        Ok(Err(e)) => {
            log_backend_error("/metadata/by-wallet db", &e.to_string());
            HttpResponse::InternalServerError().body(format!("db error: {}", e))
        }
        Err(e) => {
            log_backend_error("/metadata/by-wallet blocking", &e.to_string());
            HttpResponse::InternalServerError().body(format!("blocking error: {}", e))
        }
    }
}

fn ensure_chat_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS author_chat_messages (
            id INTEGER PRIMARY KEY,
            author_wallet TEXT NOT NULL,
            reader_wallet TEXT NOT NULL,
            sender_wallet TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )",
        (),
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_author_chat_participants ON author_chat_messages(author_wallet, reader_wallet, created_at)",
        (),
    )?;

    conn.execute(
        "DELETE FROM author_chat_messages WHERE created_at < datetime('now', '-48 hours')",
        (),
    )?;

    Ok(())
}

#[get("/chat/messages")]
async fn get_chat_messages(query: web::Query<ChatQuery>) -> impl Responder {
    let author_wallet = query.author_wallet.trim().to_string();
    let reader_wallet = query.reader_wallet.trim().to_string();
    if author_wallet.is_empty() || reader_wallet.is_empty() {
        return HttpResponse::BadRequest().body("author_wallet and reader_wallet are required");
    }

    let res = web::block(move || -> Result<Vec<ChatMessage>, rusqlite::Error> {
        let conn = open_archive_db()?;
        ensure_chat_schema(&conn)?;
        let mut stmt = conn.prepare(
            "SELECT id, author_wallet, reader_wallet, sender_wallet, message, created_at
             FROM author_chat_messages
             WHERE author_wallet = ?1 AND reader_wallet = ?2
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![author_wallet, reader_wallet], |row| {
            Ok(ChatMessage {
                id: row.get(0)?,
                author_wallet: row.get(1)?,
                reader_wallet: row.get(2)?,
                sender_wallet: row.get(3)?,
                message: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        Ok(rows.flatten().collect())
    })
    .await;

    match res {
        Ok(Ok(messages)) => HttpResponse::Ok().json(messages),
        Ok(Err(e)) => {
            log_backend_error("/chat/messages db", &e.to_string());
            HttpResponse::InternalServerError().body(format!("db error: {}", e))
        }
        Err(e) => {
            log_backend_error("/chat/messages blocking", &e.to_string());
            HttpResponse::InternalServerError().body(format!("blocking error: {}", e))
        }
    }
}

#[post("/chat/messages")]
async fn create_chat_message(payload: web::Json<ChatMessageCreate>) -> impl Responder {
    let author_wallet = payload.author_wallet.trim().to_string();
    let reader_wallet = payload.reader_wallet.trim().to_string();
    let sender_wallet = payload.sender_wallet.trim().to_string();
    let message = payload.message.trim().to_string();

    if author_wallet.is_empty() || reader_wallet.is_empty() || sender_wallet.is_empty() || message.is_empty() {
        return HttpResponse::BadRequest().body("author_wallet, reader_wallet, sender_wallet, and message are required");
    }

    if sender_wallet != author_wallet && sender_wallet != reader_wallet {
        return HttpResponse::BadRequest().body("sender_wallet must match author_wallet or reader_wallet");
    }

    let res = web::block(move || -> Result<(), rusqlite::Error> {
        let conn = open_archive_db()?;
        ensure_chat_schema(&conn)?;
        conn.execute(
            "INSERT INTO author_chat_messages (author_wallet, reader_wallet, sender_wallet, message)
             VALUES (?1, ?2, ?3, ?4)",
            params![author_wallet, reader_wallet, sender_wallet, message],
        )?;
        Ok(())
    })
    .await;

    match res {
        Ok(Ok(())) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Ok(Err(e)) => {
            log_backend_error("/chat/messages create db", &e.to_string());
            HttpResponse::InternalServerError().body(format!("db error: {}", e))
        }
        Err(e) => {
            log_backend_error("/chat/messages create blocking", &e.to_string());
            HttpResponse::InternalServerError().body(format!("blocking error: {}", e))
        }
    }
}

#[get("/search")]
async fn search_by_field(query: web::Query<HashMap<String, String>>) -> impl Responder {
    let Some(field) = query.get("field").cloned() else {
        return HttpResponse::BadRequest().body("missing 'field' query param");
    };
    let Some(q) = query.get("q").cloned() else {
        return HttpResponse::BadRequest().body("missing 'q' query param");
    };

    let allowed: HashSet<&str> = [
        "genre",
        "title",
        "difficulty",
        "summary",
        "file_hash",
        "file_cid",
        "uploader_wallet",
    ]
    .iter()
    .copied()
    .collect();

    if !allowed.contains(field.as_str()) {
        return HttpResponse::BadRequest().body(format!("field '{}' is not searchable", field));
    }

    let pattern = format!("%{}%", q);
    let sql = format!(
        "SELECT id, genre, title, difficulty, summary, file_hash, file_cid, uploader_wallet, solana_signature, COALESCE(access_type, 'open'), COALESCE(publish_fee_lamports, 1000), COALESCE(search_count, 0), COALESCE(created_at, '') FROM archive WHERE {} LIKE ?1 ORDER BY id DESC",
        field
    );

    let res = web::block(move || -> Result<Vec<ArchiveRecord>, rusqlite::Error> {
        let conn = open_archive_db()?;
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map([pattern], |row| {
            Ok(ArchiveRecord {
                id: row.get(0)?,
                genre: row.get(1)?,
                title: row.get(2)?,
                difficulty: row.get(3)?,
                summary: row.get(4)?,
                file_hash: row.get(5)?,
                file_cid: row.get(6)?,
                uploader_wallet: row.get(7).ok(),
                solana_signature: row.get(8).ok(),
                access_type: row.get(9).unwrap_or_else(|_| "open".to_string()),
                publish_fee_lamports: row.get(10).unwrap_or(1000),
                search_count: row.get(11).unwrap_or(0),
                created_at: row.get(12).unwrap_or_default(),
            })
        })?;

        let records: Vec<ArchiveRecord> = rows.flatten().collect();

        if field.as_str() == "title" {
            for record in &records {
                let _ = conn.execute(
                    "UPDATE archive SET search_count = COALESCE(search_count, 0) + 1 WHERE id = ?1",
                    params![record.id],
                );
            }
        }

        Ok(records)
    })
    .await;

    match res {
        Ok(Ok(records)) => HttpResponse::Ok().json(records),
        Ok(Err(e)) => { log_backend_error("db", &e.to_string()); HttpResponse::InternalServerError().body(format!("DB error: {}", e)) },
        Err(e) => { log_backend_error("blocking", &e.to_string()); HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)) },
    }
}

#[get("/integrity/check")]
async fn integrity_check(query: web::Query<HashMap<String, String>>) -> impl Responder {
    let Some(hash) = query.get("hash").cloned() else {
        return HttpResponse::BadRequest().body("missing 'hash' query param");
    };

    let res = web::block(move || -> Result<Option<ArchiveRecord>, rusqlite::Error> {
        let conn = open_archive_db()?;
        let mut stmt = conn.prepare(
            "SELECT id, genre, title, difficulty, summary, file_hash, file_cid, uploader_wallet, solana_signature, COALESCE(access_type, 'open'), COALESCE(publish_fee_lamports, 1000), COALESCE(search_count, 0), COALESCE(created_at, '') FROM archive WHERE file_hash = ?1 LIMIT 1",
        )?;

        let mut rows = stmt.query([hash])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(ArchiveRecord {
                id: row.get(0)?,
                genre: row.get(1)?,
                title: row.get(2)?,
                difficulty: row.get(3)?,
                summary: row.get(4)?,
                file_hash: row.get(5)?,
                file_cid: row.get(6)?,
                uploader_wallet: row.get(7).ok(),
                solana_signature: row.get(8).ok(),
                access_type: row.get(9).unwrap_or_else(|_| "open".to_string()),
                publish_fee_lamports: row.get(10).unwrap_or(1000),
                search_count: row.get(11).unwrap_or(0),
                created_at: row.get(12).unwrap_or_default(),
            }));
        }

        Ok(None)
    })
    .await;

    match res {
        Ok(Ok(record)) => {
            let exists = record.is_some();
            HttpResponse::Ok().json(IntegrityCheckResponse {
                exists,
                matches_on_chain: exists,
                record,
            })
        }
        Ok(Err(e)) => { log_backend_error("db", &e.to_string()); HttpResponse::InternalServerError().body(format!("DB error: {}", e)) },
        Err(e) => { log_backend_error("blocking", &e.to_string()); HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)) },
    }
}

#[post("/download/settle-fee")]
async fn settle_download_fee(payload: web::Json<DownloadFeeRequest>) -> impl Responder {
    let developer_wallet = env::var("DEVELOPER_WALLET").unwrap_or_else(|_| "DEV_WALLET_PLACEHOLDER".to_string());
    let record_id = payload.record_id;
    let requester = payload.downloader_wallet.clone();

    if requester.trim().is_empty() {
        return HttpResponse::BadRequest().body("downloader_wallet is required");
    }

    let res = web::block(move || -> Result<Option<String>, rusqlite::Error> {
        let conn = open_archive_db()?;
        let wallet = conn
            .query_row(
                "SELECT uploader_wallet FROM archive WHERE id = ?1",
                params![record_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?;

        Ok(wallet.flatten())
    })
    .await;

    match res {
        Ok(Ok(uploader_wallet)) => {
            if uploader_wallet.is_none() {
                return HttpResponse::NotFound().body("record not found or uploader wallet missing");
            }

            let publish_reimbursement = 800;
            let developer_cut = 200;
            HttpResponse::Ok().json(DownloadFeeResponse {
                settled: false,
                amount_lamports_total: publish_reimbursement + developer_cut,
                amount_lamports_uploader: publish_reimbursement,
                amount_lamports_developer: developer_cut,
                uploader_wallet,
                developer_wallet,
            })
        }
        Ok(Err(e)) => { log_backend_error("db", &e.to_string()); HttpResponse::InternalServerError().body(format!("DB error: {}", e)) },
        Err(e) => { log_backend_error("blocking", &e.to_string()); HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)) },
    }
}


#[get("/library/highlights")]
async fn library_highlights() -> impl Responder {
    let res = web::block(move || -> Result<LibraryHighlightsResponse, rusqlite::Error> {
        let conn = open_archive_db()?;

        let fetch_records = |query: &str| -> Result<Vec<ArchiveRecord>, rusqlite::Error> {
            let mut stmt = conn.prepare(query)?;
            let rows = stmt.query_map([], |row| {
                Ok(ArchiveRecord {
                    id: row.get(0)?,
                    genre: row.get(1)?,
                    title: row.get(2)?,
                    difficulty: row.get(3)?,
                    summary: row.get(4)?,
                    file_hash: row.get(5)?,
                    file_cid: row.get(6)?,
                    uploader_wallet: row.get(7).ok(),
                    solana_signature: row.get(8).ok(),
                    access_type: row.get(9).unwrap_or_else(|_| "open".to_string()),
                    publish_fee_lamports: row.get(10).unwrap_or(1000),
                    search_count: row.get(11).unwrap_or(0),
                    created_at: row.get(12).unwrap_or_default(),
                })
            })?;
            Ok(rows.flatten().collect())
        };

        let base = "SELECT id, genre, title, difficulty, summary, file_hash, file_cid, uploader_wallet, solana_signature, COALESCE(access_type, 'open'), COALESCE(publish_fee_lamports, 1000), COALESCE(search_count, 0), COALESCE(created_at, '') FROM archive";

        let top_searched = fetch_records(&format!("{} ORDER BY search_count DESC, id DESC LIMIT 15", base))?;
        let recent = fetch_records(&format!("{} ORDER BY id DESC LIMIT 10", base))?;
        let random = fetch_records(&format!("{} ORDER BY RANDOM() LIMIT 5", base))?;

        Ok(LibraryHighlightsResponse { top_searched, recent, random })
    })
    .await;

    match res {
        Ok(Ok(payload)) => HttpResponse::Ok().json(payload),
        Ok(Err(e)) => { log_backend_error("db", &e.to_string()); HttpResponse::InternalServerError().body(format!("DB error: {}", e)) },
        Err(e) => { log_backend_error("blocking", &e.to_string()); HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)) },
    }
}

#[get("/analytics/difficulty")]
async fn difficulty() -> impl Responder {
    let client = Client::new();
    match client.get(format!("{}/analytics/difficulty", python_engine_base())).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid JSON from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}

#[get("/analytics/genre")]
async fn genre() -> impl Responder {
    let client = Client::new();
    match client.get(format!("{}/analytics/genre", python_engine_base())).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid JSON from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}

#[get("/analytics/clusters")]
async fn clusters(query: web::Query<HashMap<String, String>>) -> impl Responder {
    let client = Client::new();
    let n = query.get("n").cloned().unwrap_or_else(|| "3".to_string());
    let url = format!("{}/analytics/clusters?n={}", python_engine_base(), n);

    match client.get(&url).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid JSON from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}

#[post("/ai-search")]
async fn search(payload: web::Json<VectorSearchRequest>) -> impl Responder {
    let client = Client::new();
    let body = serde_json::json!({
        "query": payload.query,
        "k": payload.k.unwrap_or(3),
    });

    match client.post(format!("{}/search", python_engine_base())).json(&body).send().await {
        Ok(resp) => match resp.json::<VectorSearchResult>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid response from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}

#[post("/api/upload")]
async fn upload(mut payload: Multipart) -> Result<impl Responder, Error> {
    let _ = std::fs::create_dir_all("./uploads");

    let mut wallet_address: Option<String> = None;
    let mut access_type: String = "open".to_string();
    let mut publish_fee_lamports: i64 = 1000;
    let mut uploaded_file_path: Option<String> = None;
    let mut original_filename_opt: Option<String> = None;

    while let Some(field_res) = payload.next().await {
        let mut field = field_res.map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("Multipart field error: {}", e))
        })?;

        let field_name = field.name().to_string();
        if field_name == "wallet_address" || field_name == "access_type" || field_name == "publish_fee_lamports" {
            let mut bytes = Vec::new();
            while let Some(chunk_res) = field.next().await {
                let chunk = chunk_res.map_err(|e| {
                    actix_web::error::ErrorInternalServerError(format!("Chunk read error: {}", e))
                })?;
                bytes.extend_from_slice(&chunk);
            }

            let value = String::from_utf8_lossy(&bytes).trim().to_string();
            if field_name == "wallet_address" {
                wallet_address = Some(value);
            } else if field_name == "access_type" {
                access_type = if value.eq_ignore_ascii_case("restricted") { "restricted".to_string() } else { "open".to_string() };
            } else if field_name == "publish_fee_lamports" {
                publish_fee_lamports = value.parse::<i64>().unwrap_or(1000).max(0);
            }
            continue;
        }

        if field_name != "file" {
            continue;
        }

        let cd = field.content_disposition().clone();
        original_filename_opt = cd.get_filename().map(|s| s.to_string());

        let uuid = Uuid::new_v4().to_string();
        let server_filename = if let Some(ref orig) = original_filename_opt {
            let sanitized = sanitize(orig);
            if let Some(ext) = Path::new(&sanitized).extension() {
                format!("{}.{}", uuid, ext.to_string_lossy())
            } else {
                uuid.clone()
            }
        } else {
            uuid.clone()
        };

        let filepath = format!("./uploads/{}", server_filename);
        let mut f = File::create(&filepath).await.map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("File create error: {}", e))
        })?;

        while let Some(chunk_res) = field.next().await {
            let chunk = chunk_res.map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!("Chunk read error: {}", e))
            })?;
            f.write_all(&chunk).await.map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!("File write error: {}", e))
            })?;
        }

        uploaded_file_path = Some(filepath);
    }

    let uploader_wallet = wallet_address.unwrap_or_default();
    if uploader_wallet.is_empty() {
        return Ok(HttpResponse::BadRequest().body("wallet_address is required"));
    }

    let Some(filepath) = uploaded_file_path else {
        return Ok(HttpResponse::BadRequest().body("No file uploaded"));
    };

    let metadata: ExtractedMetaData = match get_meta_data_response(filepath.clone()).await {
        Ok(m) => m,
        Err(e) => return Ok(HttpResponse::InternalServerError().body(format!("Metadata extraction failed: {}", e))),
    };

    let file_record: FileRecord = match package_hash_and_cid(filepath.clone()).await {
        Ok(r) => r,
        Err(e) => return Ok(HttpResponse::InternalServerError().body(format!("File packaging failed: {}", e))),
    };

    let metadata_clone = metadata.clone();
    let file_record_clone2 = file_record.clone();
    let wallet_clone = uploader_wallet.clone();
    let path_for_insert = db_path();
    let path_for_update = db_path();
    let db_res = tokio::task::spawn_blocking(move || {
        add_to_or_create_database(
            &metadata_clone,
            &file_record_clone2,
            &wallet_clone,
            "",
            path_for_insert,
        )
        .map_err(|e| e.to_string())
    })
    .await;

    match db_res {
        Ok(Ok(_)) => {
            let _ = Connection::open(path_for_update).and_then(|conn| {
                let _ = ensure_archive_schema(&conn);
                conn.execute(
                    "UPDATE archive SET access_type = ?1, publish_fee_lamports = ?2, created_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE file_hash = ?3",
                    params![access_type, publish_fee_lamports, file_record.file_hash.clone()],
                )
            });

            let memo_message = format!(
                "book_hash:{};ipfs_cid:{}",
                file_record.file_hash.clone(),
                file_record.file_cid.clone()
            );

            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "original_filename": original_filename_opt,
                "metadata": metadata,
                "file_record": file_record,
                "memo_message": memo_message,
                "uploader_wallet": uploader_wallet,
                "access_type": access_type,
                "publish_fee_lamports": publish_fee_lamports
            })))
        },
        Ok(Err(e)) => { log_backend_error("/api/upload db insert", &e); Ok(HttpResponse::InternalServerError().body(format!("Database insertion failed: {}", e))) },
        Err(join_err) => { log_backend_error("/api/upload db join", &join_err.to_string()); Ok(HttpResponse::InternalServerError().body(format!("Database thread join error: {}", join_err))) },
    }
}

#[post("/api/upload/confirm-signature")]
async fn confirm_upload_signature(payload: web::Json<UploadSignatureRequest>) -> impl Responder {
    if payload.file_hash.trim().is_empty() || payload.solana_signature.trim().is_empty() || payload.uploader_wallet.trim().is_empty() {
        return HttpResponse::BadRequest().body("file_hash, solana_signature, and uploader_wallet are required");
    }

    let file_hash = payload.file_hash.clone();
    let signature = payload.solana_signature.clone();
    let uploader_wallet = payload.uploader_wallet.clone();

    let res = web::block(move || -> Result<usize, rusqlite::Error> {
        let conn = open_archive_db()?;
        conn.execute(
            "UPDATE archive SET solana_signature = ?1, uploader_wallet = ?2 WHERE file_hash = ?3",
            params![signature, uploader_wallet, file_hash],
        )
    })
    .await;

    match res {
        Ok(Ok(rows)) if rows > 0 => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Ok(Ok(_)) => HttpResponse::NotFound().body("file hash not found"),
        Ok(Err(e)) => {
            log_backend_error("/api/upload/confirm-signature db", &e.to_string());
            HttpResponse::InternalServerError().body(format!("DB error: {}", e))
        }
        Err(e) => {
            log_backend_error("/api/upload/confirm-signature blocking", &e.to_string());
            HttpResponse::InternalServerError().body(format!("Blocking error: {}", e))
        }
    }
}


#[actix_web::main]
async fn main() -> std::io::Result<()> {
    if let Err(e) = open_archive_db() {
        log_backend_error("startup schema migration", &e.to_string());
    }
    if let Ok(conn) = Connection::open(db_path()) {
        if let Err(e) = ensure_chat_schema(&conn) {
            log_backend_error("startup chat schema migration", &e.to_string());
        }
    }

    HttpServer::new(|| {
        let cors = Cors::default()
            .allowed_origin_fn(|origin, _req_head| {
                origin
                    .to_str()
                    .map(|value| {
                        value.starts_with("http://0.0.0.0:") || value.starts_with("http://localhost:") || value.starts_with("http://127.0.0.1:")
                    })
                    .unwrap_or(false)
            })
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allowed_headers(vec![
                http::header::CONTENT_TYPE,
                http::header::ACCEPT,
                http::header::AUTHORIZATION,
            ])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .service(hello)
            .service(list_all)
            .service(list_by_wallet)
            .service(get_chat_messages)
            .service(create_chat_message)
            .service(search_by_field)
            .service(integrity_check)
            .service(settle_download_fee)
            .service(library_highlights)
            .service(search)
            .service(difficulty)
            .service(genre)
            .service(clusters)
            .service(upload)
            .service(confirm_upload_signature)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
    .bind(("0.0.0.0", 5000))?
    .run()
    .await
}
