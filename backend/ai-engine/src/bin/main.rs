// main.rs: This is the server (should've probably called it server.rs lmao)

// server stuff
use actix_web::{post, get, web, App, HttpResponse, HttpServer, Responder};
use serde::{Serialize, Deserialize};
use rusqlite::Connection;
use std::collections::HashSet;

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
const UPLOADS_DIR: &str = "./uploads";
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



// start the actix server
#[actix_web::main]
async fn main() -> std::io::Result<()>{
    HttpServer::new(|| {
        App::new()
            .service(list_all)
            .service(get_entry_by_id)
            .service(search_by_field)
            .service(hello)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
        .bind(("127.0.0.1", 5000))?
        .run()
        .await
}