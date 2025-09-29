// main.rs: This is the server (should've probably called it server.rs lmao)

// server stuff
use actix_web::{post, get, web, App, HttpResponse, HttpServer, Responder, Error};
use serde::{Serialize, Deserialize};
use reqwest::Client;
use serde_json::Value;
use rusqlite::Connection;
use std::collections::HashSet;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;


use uuid::Uuid;
use sanitize_filename::sanitize;
use actix_multipart::Multipart;
use futures_util::StreamExt;

// TODO: add signature to the filerecord stuff

// structs
use ai_engine::{ExtractedMetaData, FileRecord};

// functionality
use ai_engine::get_meta_data_response;
use ai_engine::package_hash_and_cid;

// the database
use ai_engine::add_to_or_create_database;

// the solana
use ai_engine::send_memo;


// Request and Response Schema
#[derive(Debug, Deserialize)]
pub struct ProcessRequest{
    pub file_path: String,
}

#[derive(Debug, Deserialize)]
pub struct ProcessResponse{
    pub metadata: ExtractedMetaData,
    pub file_record: FileRecord,
    pub memo: String,
}


// VectorDatabase endpoints
#[derive(Debug, Deserialize)]
struct VectorSearchRequest{
    query: String,
    k: Option<usize>,
}

#[derive(Serialize, Deserialize, Debug)]
struct VectorSearchResult{
    id: Vec<Vec<String>>,
    documents: Vec<Vec<String>>,
    metadatas: Vec<Vec<Value>>,
    distances: Vec<Vec<f32>>
}



// TODO: should we find a better work around this?
#[derive(Debug, Serialize, Deserialize)]
pub struct ArchiveRecord{
    id: i64,
    genre: String,
    title: String,
    difficulty: String,
    summary: String,
    file_hash: String,
    file_cid: String,
}
// TODO: change this dir to something better
const DB_NAME: &str = "archive.db";

// basic page
#[get("/")]
async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello world!")
}

// get the metadata from the database
#[get("/metadata")]
// list all metadata we have
async fn list_all() -> impl Responder {
    let db_name = DB_NAME.to_string();
    let res = web::block(move || -> Result<Vec<(String, String, String, String, String, String)>, anyhow::Error> {
        let conn = Connection::open(db_name)?;
        let mut stmt = conn.prepare("SELECT id, genre, title, difficulty, summary, file_hash, file_cid FROM archive").ok();
        if stmt.is_none() {
            return Ok(vec![]);
        }
        let mut stmt = stmt.unwrap();
        let mut rows = stmt.query([])?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let genre: String = row.get(1)?;
            let title: String = row.get(2)?;
            let difficulty: String = row.get(3)?;
            let summary: String = row.get(4)?;
            let file_hash: String = row.get(5)?;
            let file_cid: String = row.get(6)?;
            out.push((id.to_string(), genre, title, difficulty, summary, format!("{}|{}", file_hash, file_cid)));
        }
        Ok(out)
    })
        .await;

    match res {
        Ok(Ok(rows)) => HttpResponse::Ok().json(rows),
        Ok(Err(e)) => HttpResponse::InternalServerError().body(format!("db error: {}", e)),
        Err(e) => HttpResponse::InternalServerError().body(format!("blocking error: {}", e)),
    }
}

#[get("/metadata/{id}")]
async fn get_entry_by_id(path: web::Path<i64>) -> impl Responder {
    let id = path.into_inner();

    let res = web::block(move || -> Result<ArchiveRecord, rusqlite::Error> {
        let conn = Connection::open(DB_NAME)?;
        conn.query_row(
            "SELECT id, genre, title, difficulty, summary, file_hash, file_cid FROM archive WHERE id = ?1",
            [id],
            |row| {
                Ok(ArchiveRecord {
                    id: row.get(0)?,
                    genre: row.get(1)?,
                    title: row.get(2)?,
                    difficulty: row.get(3)?,
                    summary: row.get(4)?,
                    file_hash: row.get(5)?,
                    file_cid: row.get(6)?,
                })
            },
        )
    })
        .await;

    match res {
        Ok(Ok(record)) => HttpResponse::Ok().json(record),
        Ok(Err(rusqlite::Error::QueryReturnedNoRows)) => HttpResponse::NotFound().body("Record not found"),
        Ok(Err(e)) => HttpResponse::InternalServerError().body(format!("DB error: {}", e)),
        Err(e) => HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)),
    }
}

#[get("/search")]
async fn search_by_field(query: web::Query<std::collections::HashMap<String, String>>) -> impl Responder {
    // required params: field, q
    let field = match query.get("field") {
        Some(f) => f.as_str(),
        None => return HttpResponse::BadRequest().body("missing 'field' query param"),
    };
    let q = match query.get("q") {
        Some(q) => q.clone(),
        None => return HttpResponse::BadRequest().body("missing 'q' query param"),
    };

    // whitelist allowed searchable fields to avoid SQL injection
    let allowed: HashSet<&str> = [
        "genre",
        "title",
        "difficulty",
        "summary",
        "file_hash",
        "file_cid",
    ]
        .iter()
        .copied()
        .collect();

    if !allowed.contains(field) {
        return HttpResponse::BadRequest()
            .body(format!("field '{}' is not searchable", field));
    }

    // Build pattern for LIKE
    let pattern = format!("%{}%", q);

    // We cannot parametrize column name, so we inject the validated field name into SQL.
    // The value itself is bound as a parameter to avoid injection on content.
    let sql = format!(
        "SELECT id, genre, title, difficulty, summary, file_hash, file_cid FROM archive WHERE {} LIKE ?1",
        field
    );

    let res = web::block(move || -> Result<Vec<ArchiveRecord>, rusqlite::Error> {
        let conn = Connection::open(DB_NAME)?;
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
            })
        })?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    })
        .await;

    match res {
        Ok(Ok(records)) => HttpResponse::Ok().json(records),
        Ok(Err(e)) => HttpResponse::InternalServerError().body(format!("DB error: {}", e)),
        Err(e) => HttpResponse::InternalServerError().body(format!("Blocking error: {}", e)),
    }
}

#[get("/analytics/difficulty")]
async fn difficulty() -> impl Responder {
    let client = Client::new();
    let url = "http://127.0.0.1:8001/analytics/difficulty";

    match client.get(url).send().await {
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
    let url = "http://127.0.0.1:8001/analytics/genre";

    match client.get(url).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid JSON from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}

#[get("/analytics/clusters")]
async fn clusters(query: web::Query<std::collections::HashMap<String, String>>) -> impl Responder {
    let client = Client::new();
    let n = query.get("n").unwrap_or(&"3".to_string()); // default to 3 clusters
    let url = format!("http://127.0.0.1:8001/analytics/clusters?n={}", n);

    match client.get(&url).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(_) => HttpResponse::InternalServerError().body("Invalid JSON from vector service"),
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}
#[post("/ai-search")]
async fn search(payload: web::Json<SearchRequest>) -> impl Responder {
    let client = Client::new();
    let url = "http://127.0.0.1:8001/search"; // Python FastAPI endpoint

    let body = serde_json::json!({
        "query": payload.query,
        "k": payload.k.unwrap_or(3),
    });

    match client.post(url).json(&body).send().await {
        Ok(resp) => {
            if let Ok(json) = resp.json::<SearchResult>().await {
                HttpResponse::Ok().json(json)
            } else {
                HttpResponse::InternalServerError().body("Invalid response from vector service")
            }
        }
        Err(e) => HttpResponse::InternalServerError().body(format!("Error: {:?}", e)),
    }
}


#[post("/api/upload")]
async fn upload(mut payload: Multipart) -> Result<impl Responder, Error> {
    // create uploads dir (synchronous ok here)
    let _ = std::fs::create_dir_all("./uploads");

    // iterate over multipart fields
    while let Some(field_res) = payload.next().await {
        let mut field = field_res.map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("Multipart field error: {}", e))
        })?;

        // clone ContentDisposition (field.content_disposition() returns &ContentDisposition)
        let cd = field.content_disposition().clone();

        // extract original filename if present
        let original_filename_opt: Option<String> = cd
            .get_filename()
            .map(|s| s.to_string());

        // choose server filename
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


        // create file asynchronously
        let mut f = File::create(&filepath).await.map_err(|e| {
            actix_web::error::ErrorInternalServerError(format!("File create error: {}", e))
        })?;

        // async chunk writes
        while let Some(chunk_res) = field.next().await {
            let chunk = chunk_res.map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!("Chunk read error: {}", e))
            })?;
            f.write_all(&chunk).await.map_err(|e| {
                actix_web::error::ErrorInternalServerError(format!("File write error: {}", e))
            })?;
        }

        // Step 1: metadata extraction (async)
        let metadata = match get_meta_data_response(filepath.clone()).await {
            Ok(m) => m,
            Err(e) => {
                return Ok(HttpResponse::InternalServerError()
                    .body(format!("Metadata extraction failed: {}", e)));
            }
        };

        // Step 2: hash + CID packaging (async)
        let file_record = match package_hash_and_cid(filepath.clone()).await {
            Ok(r) => r,
            Err(e) => {
                return Ok(HttpResponse::InternalServerError()
                    .body(format!("File packaging failed: {}", e)));
            }
        };

        // Step 3: send memo to Solana (blocking work)
        // Ensure closure returns types that are Send + 'static by mapping errors to String
        let file_record_clone = file_record.clone();
        let memo_sig = match tokio::task::spawn_blocking(move || {
            send_memo(&file_record_clone.file_hash, &file_record_clone.file_cid)
                .map_err(|e| e.to_string())
        })
            .await
        {
            Ok(Ok(sig)) => sig,
            Ok(Err(e_str)) => {
                return Ok(HttpResponse::InternalServerError()
                    .body(format!("Solana memo failed: {}", e_str)));
            }
            Err(join_err) => {
                return Ok(HttpResponse::InternalServerError()
                    .body(format!("Join error in Solana memo: {}", join_err)));
            }
        };

        // Step 4: DB insertion (blocking work)
        let metadata_clone = metadata.clone();
        let file_record_clone2 = file_record.clone();
        let db_res = tokio::task::spawn_blocking(move || {
            add_to_or_create_database(&metadata_clone, &file_record_clone2, "archive.db".to_string())
                .map_err(|e| e.to_string())
        })
            .await;

        // handle spawn_blocking join error
        let db_inner_res = match db_res {
            Ok(inner) => inner,
            Err(join_err) => {
                return Ok(HttpResponse::InternalServerError()
                    .body(format!("Database thread join error: {}", join_err)));
            }
        };

        if let Err(db_err_str) = db_inner_res {
            return Ok(HttpResponse::InternalServerError()
                .body(format!("Database insertion failed: {}", db_err_str)));
        }

        // Final JSON response for this file
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "status": "success",
            "server_filename": server_filename,
            "original_filename": original_filename_opt,
            "metadata": metadata,
            "file_record": file_record,
            "solana_signature": memo_sig
        })));
    }

    // if we get here, no fields were uploaded
    Ok(HttpResponse::BadRequest().body("No file uploaded"))
}

// start the actix server
#[actix_web::main]
async fn main() -> std::io::Result<()>{

    HttpServer::new(|| {
        App::new()
            .service(search)
            .service(difficulty)
            .service(genre)
            .service(clusters)
            .service(list_all)
            .service(get_entry_by_id)
            .service(search_by_field)
            .service(hello)
            .service(upload)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
        .bind(("127.0.0.1", 5000))?
        .run()
        .await
}

