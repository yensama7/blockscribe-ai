//! Blockscribe — academic preservation repository.
//! Rust API: auth, submissions, lifecycle, anchoring, verify, OAI-PMH.

use actix_cors::Cors;
use actix_multipart::Multipart;
use actix_web::{App, HttpRequest, HttpResponse, HttpServer, Responder, get, http, post, web};
use chrono::{DateTime, NaiveDate, Utc};
use deadpool_postgres::Pool;
use ed25519_dalek::SigningKey;
use futures_util::StreamExt;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashMap;
use std::env;
use uuid::Uuid;

use ai_engine::{chain, db, ipfs, oai, vecsvc};
use ai_engine::{extract_academic_metadata, extract_text, extract_text_from_bytes, sha256_hex_of};

const MAX_UPLOAD_BYTES: usize = 25 * 1024 * 1024;

struct AppState {
    pool: Pool,
    fee_payer: SigningKey,
}

fn institution_name() -> String {
    env::var("INSTITUTION_NAME").unwrap_or_else(|_| "Demo University".to_string())
}

fn public_base_url() -> String {
    env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:5000".to_string())
}

fn err_json(status: u16, msg: &str) -> HttpResponse {
    let mut builder = HttpResponse::build(
        actix_web::http::StatusCode::from_u16(status).unwrap_or(actix_web::http::StatusCode::INTERNAL_SERVER_ERROR),
    );
    builder.json(json!({"error": msg}))
}

fn e500(context: &str, err: impl std::fmt::Display) -> HttpResponse {
    eprintln!("[backend-error] {context}: {err}");
    err_json(500, &format!("{context}: {err}"))
}

// ---------- auth ----------

#[derive(Clone)]
struct UserCtx {
    id: Uuid,
    email: String,
    display_name: String,
    role: String,
    institution_id: Option<Uuid>,
    custodial_pubkey: String,
    custodial_secret: Option<Vec<u8>>,
}

fn user_json(u: &UserCtx) -> Value {
    json!({
        "id": u.id.to_string(),
        "email": u.email,
        "display_name": u.display_name,
        "role": u.role,
        "wallet_pubkey": u.custodial_pubkey,
    })
}

async fn auth_user(state: &AppState, req: &HttpRequest) -> Option<UserCtx> {
    let token = req
        .headers()
        .get("Authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")?
        .trim()
        .parse::<Uuid>()
        .ok()?;
    let client = state.pool.get().await.ok()?;
    let row = client
        .query_opt(
            "SELECT u.id, u.email, u.display_name, u.role, u.institution_id, u.custodial_pubkey, u.custodial_secret
             FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1",
            &[&token],
        )
        .await
        .ok()??;
    Some(UserCtx {
        id: row.get(0),
        email: row.get(1),
        display_name: row.get(2),
        role: row.get(3),
        institution_id: row.get(4),
        custodial_pubkey: row.get(5),
        custodial_secret: row.get(6),
    })
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    display_name: Option<String>,
    orcid: Option<String>,
}

/// Institutional email login. A Solana keypair is generated on first login
/// and custodied server-side — users never see a wallet (restructure.md §4).
/// ponytail: real deployment sends a magic link / does SSO; the demo trusts
/// the typed email so an audience can log in as several people quickly.
#[post("/api/auth/login")]
async fn login(state: web::Data<AppState>, body: web::Json<LoginRequest>) -> impl Responder {
    let email = body.email.trim().to_lowercase();
    if !email.contains('@') || email.len() < 5 {
        return err_json(400, "a valid email address is required");
    }
    let display_name = body
        .display_name
        .clone()
        .unwrap_or_default()
        .trim()
        .to_string();
    let fallback_name = email.split('@').next().unwrap_or("user").to_string();

    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };

    // single default institution for the demo; federation is Phase 5
    let inst_id: Uuid = match client
        .query_opt("SELECT id FROM institutions LIMIT 1", &[])
        .await
    {
        Ok(Some(row)) => row.get(0),
        Ok(None) => {
            let id = Uuid::new_v4();
            let signer = bs58::encode(state.fee_payer.verifying_key().as_bytes()).into_string();
            if let Err(e) = client
                .execute(
                    "INSERT INTO institutions (id, name, domain, signer_pubkey) VALUES ($1, $2, $3, $4)",
                    &[&id, &institution_name(), &"demo.edu", &signer],
                )
                .await
            {
                return e500("create institution", e);
            }
            id
        }
        Err(e) => return e500("institution lookup", e),
    };

    let existing = client
        .query_opt(
            "SELECT id FROM users WHERE email = $1",
            &[&email],
        )
        .await;

    let user_id: Uuid = match existing {
        Ok(Some(row)) => row.get(0),
        Ok(None) => {
            let count: i64 = match client.query_one("SELECT count(*) FROM users", &[]).await {
                Ok(r) => r.get(0),
                Err(e) => return e500("user count", e),
            };
            let editors = env::var("EDITOR_EMAILS").unwrap_or_default();
            let is_editor = count == 0
                || editors
                    .split(',')
                    .any(|e| e.trim().eq_ignore_ascii_case(&email));
            let role = if is_editor { "editor" } else { "author" };
            let (pubkey, secret) = chain::generate_custodial_keypair();
            let id = Uuid::new_v4();
            let name = if display_name.is_empty() { &fallback_name } else { &display_name };
            if let Err(e) = client
                .execute(
                    "INSERT INTO users (id, institution_id, email, orcid, display_name, role, custodial_pubkey, custodial_secret)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    &[&id, &inst_id, &email, &body.orcid.clone().unwrap_or_default(), name, &role, &pubkey, &secret],
                )
                .await
            {
                return e500("create user", e);
            }
            id
        }
        Err(e) => return e500("user lookup", e),
    };

    if !display_name.is_empty() {
        let _ = client
            .execute("UPDATE users SET display_name = $1 WHERE id = $2", &[&display_name, &user_id])
            .await;
    }

    let token = Uuid::new_v4();
    if let Err(e) = client
        .execute("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", &[&token, &user_id])
        .await
    {
        return e500("create session", e);
    }

    let row = match client
        .query_one(
            "SELECT id, email, display_name, role, institution_id, custodial_pubkey, custodial_secret FROM users WHERE id = $1",
            &[&user_id],
        )
        .await
    {
        Ok(r) => r,
        Err(e) => return e500("reload user", e),
    };
    let user = UserCtx {
        id: row.get(0),
        email: row.get(1),
        display_name: row.get(2),
        role: row.get(3),
        institution_id: row.get(4),
        custodial_pubkey: row.get(5),
        custodial_secret: row.get(6),
    };
    HttpResponse::Ok().json(json!({"token": token.to_string(), "user": user_json(&user)}))
}

#[get("/api/auth/me")]
async fn me(state: web::Data<AppState>, req: HttpRequest) -> impl Responder {
    match auth_user(&state, &req).await {
        Some(u) => HttpResponse::Ok().json(user_json(&u)),
        None => err_json(401, "not logged in"),
    }
}

#[get("/api/users")]
async fn list_users(state: web::Data<AppState>, req: HttpRequest) -> impl Responder {
    if auth_user(&state, &req).await.is_none() {
        return err_json(401, "not logged in");
    }
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    match client
        .query("SELECT id, email, display_name, role, orcid FROM users ORDER BY created_at", &[])
        .await
    {
        Ok(rows) => HttpResponse::Ok().json(
            rows.iter()
                .map(|r| {
                    json!({
                        "id": r.get::<_, Uuid>(0).to_string(),
                        "email": r.get::<_, String>(1),
                        "display_name": r.get::<_, String>(2),
                        "role": r.get::<_, String>(3),
                        "orcid": r.get::<_, String>(4),
                    })
                })
                .collect::<Vec<_>>(),
        ),
        Err(e) => e500("list users", e),
    }
}

// ---------- submission listing ----------

const SUBMISSION_SELECT: &str = "
    SELECT s.id, s.title, s.discipline, s.language, s.visibility, s.license, s.doi,
           s.authors, s.abstract_text, s.keywords, s.created_at, s.embargo_until,
           v.id, v.version_no, v.file_hash, v.cid, v.metadata_cid, v.status, v.pda_address,
           u.display_name, u.id, i.name
    FROM submissions s
    JOIN versions v ON v.id = s.current_version_id
    LEFT JOIN users u ON u.id = s.corresponding_author_id
    LEFT JOIN institutions i ON i.id = s.institution_id";

fn submission_row_json(row: &tokio_postgres::Row) -> Value {
    let visibility: String = row.get(4);
    let embargo_until: Option<NaiveDate> = row.get(11);
    let cid: String = row.get(15);
    let embargo_active = visibility == "embargoed"
        && embargo_until.map(|d| d > Utc::now().date_naive()).unwrap_or(true);
    let full_text_available = visibility == "public" || (visibility == "embargoed" && !embargo_active);

    json!({
        "id": row.get::<_, Uuid>(0).to_string(),
        "title": row.get::<_, String>(1),
        "discipline": row.get::<_, String>(2),
        "language": row.get::<_, String>(3),
        "visibility": visibility,
        "license": row.get::<_, String>(5),
        "doi": row.get::<_, String>(6),
        "authors": row.get::<_, String>(7),
        "abstract": row.get::<_, String>(8),
        "keywords": row.get::<_, String>(9),
        "created_at": row.get::<_, DateTime<Utc>>(10).to_rfc3339(),
        "embargo_until": embargo_until.map(|d| d.to_string()),
        "version_id": row.get::<_, Uuid>(12).to_string(),
        "version_no": row.get::<_, i32>(13),
        "file_hash": row.get::<_, String>(14),
        "cid": if full_text_available { cid } else { String::new() },
        "full_text_available": full_text_available,
        "metadata_cid": row.get::<_, String>(16),
        "status": row.get::<_, String>(17),
        "pda_address": row.get::<_, String>(18),
        "author_name": row.get::<_, Option<String>>(19).unwrap_or_default(),
        "author_id": row.get::<_, Option<Uuid>>(20).map(|u| u.to_string()).unwrap_or_default(),
        "institution": row.get::<_, Option<String>>(21).unwrap_or_default(),
        "gateway_url": ipfs::ipfs_gateway_url(),
    })
}

#[get("/api/submissions")]
async fn list_submissions(
    state: web::Data<AppState>,
    req: HttpRequest,
    query: web::Query<HashMap<String, String>>,
) -> impl Responder {
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let rows = match client
        .query(&format!("{SUBMISSION_SELECT} ORDER BY s.created_at DESC LIMIT 500"), &[])
        .await
    {
        Ok(r) => r,
        Err(e) => return e500("list submissions", e),
    };

    // ponytail: filtering in memory — fine below a few thousand records,
    // move into SQL when the corpus outgrows the demo
    let q = query.get("q").map(|s| s.to_lowercase()).unwrap_or_default();
    let discipline = query.get("discipline").map(|s| s.to_lowercase()).unwrap_or_default();
    let status = query.get("status").cloned().unwrap_or_default();
    let mine = query.get("mine").map(|v| v == "true").unwrap_or(false);
    let viewer = if mine { auth_user(&state, &req).await } else { None };
    if mine && viewer.is_none() {
        return err_json(401, "log in to list your submissions");
    }

    let items: Vec<Value> = rows
        .iter()
        .filter(|row| {
            if let Some(u) = &viewer {
                if row.get::<_, Option<Uuid>>(20) != Some(u.id) {
                    return false;
                }
            }
            if !status.is_empty() && row.get::<_, String>(17) != status {
                return false;
            }
            if !discipline.is_empty() && !row.get::<_, String>(2).to_lowercase().contains(&discipline) {
                return false;
            }
            if !q.is_empty() {
                let haystack = format!(
                    "{} {} {} {}",
                    row.get::<_, String>(1),
                    row.get::<_, String>(7),
                    row.get::<_, String>(8),
                    row.get::<_, String>(9)
                )
                .to_lowercase();
                if !haystack.contains(&q) {
                    return false;
                }
            }
            true
        })
        .map(submission_row_json)
        .collect();

    HttpResponse::Ok().json(items)
}

// ---------- anchoring helper ----------

async fn record_anchor(state: &AppState, version_id: Uuid, instruction: &str, mut memo: Value) -> Value {
    let anchor_id = Uuid::new_v4();
    let pda = memo
        .get("hash")
        .and_then(|h| h.as_str())
        .and_then(|h| chain::derive_document_pda(h).ok())
        .map(|(addr, _)| addr)
        .unwrap_or_default();
    memo["proto"] = json!("blockscribe/1");
    memo["instr"] = json!(instruction);
    memo["pda"] = json!(pda);

    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return json!({"instruction": instruction, "status": "error", "error": e.to_string()}),
    };
    let _ = client
        .execute(
            "INSERT INTO anchors (id, version_id, instruction, pda_address, status, memo) VALUES ($1, $2, $3, $4, 'pending', $5)",
            &[&anchor_id, &version_id, &instruction, &pda, &memo],
        )
        .await;

    match chain::anchor_memo(&state.fee_payer, &memo).await {
        Ok(res) => {
            let _ = client
                .execute(
                    "UPDATE anchors SET signature = $1, slot = $2, status = 'confirmed', confirmed_at = now() WHERE id = $3",
                    &[&res.signature, &res.slot, &anchor_id],
                )
                .await;
            let _ = client
                .execute("UPDATE versions SET pda_address = $1 WHERE id = $2 AND pda_address = ''", &[&pda, &version_id])
                .await;
            json!({"instruction": instruction, "status": "confirmed", "signature": res.signature, "slot": res.slot, "pda_address": pda})
        }
        Err(e) => {
            eprintln!("[anchor] {instruction} for {version_id} not confirmed: {e}");
            let _ = client
                .execute("UPDATE anchors SET status = 'unanchored' WHERE id = $1", &[&anchor_id])
                .await;
            json!({"instruction": instruction, "status": "unanchored", "error": e.to_string(), "pda_address": pda})
        }
    }
}

// ---------- submission pipeline ----------

struct UploadForm {
    file_bytes: Vec<u8>,
    filename: String,
    fields: HashMap<String, String>,
}

async fn read_multipart(mut payload: Multipart) -> Result<UploadForm, HttpResponse> {
    let mut form = UploadForm {
        file_bytes: Vec::new(),
        filename: String::new(),
        fields: HashMap::new(),
    };
    while let Some(field_res) = payload.next().await {
        let mut field = field_res.map_err(|e| err_json(400, &format!("multipart error: {e}")))?;
        let name = field.name().to_string();
        let filename = field
            .content_disposition()
            .get_filename()
            .map(|s| sanitize_filename::sanitize(s));
        let mut bytes = Vec::new();
        while let Some(chunk) = field.next().await {
            let chunk = chunk.map_err(|e| err_json(400, &format!("read error: {e}")))?;
            bytes.extend_from_slice(&chunk);
            if bytes.len() > MAX_UPLOAD_BYTES {
                return Err(err_json(413, "file exceeds 25MB limit"));
            }
        }
        if name == "file" {
            form.filename = filename.unwrap_or_else(|| "upload.pdf".to_string());
            form.file_bytes = bytes;
        } else {
            form.fields.insert(name, String::from_utf8_lossy(&bytes).trim().to_string());
        }
    }
    if form.file_bytes.is_empty() {
        return Err(err_json(400, "no file uploaded"));
    }
    if let Some(reason) = unsafe_upload_reason(&form.file_bytes) {
        return Err(err_json(400, reason));
    }
    Ok(form)
}

/// Reject dangerous uploads at the trust boundary (restructure.md §15): once a
/// CID is published it is effectively permanent, so validate by content, not by
/// extension, and refuse active content in PDFs.
/// ponytail: signature/keyword scan, not a full malware engine — wire ClamAV
/// here before accepting uploads from the open internet.
fn unsafe_upload_reason(bytes: &[u8]) -> Option<&'static str> {
    // Content sniffing: only allow PDF or plain-text-ish uploads.
    let is_pdf = bytes.starts_with(b"%PDF");
    let looks_binary = bytes.iter().take(1024).any(|&b| b == 0);
    if !is_pdf && looks_binary {
        return Some("unsupported file type — upload a PDF or a text document");
    }
    if is_pdf {
        // Flag active content that has no place in an archived paper.
        let has = |needle: &[u8]| bytes.windows(needle.len()).any(|w| w == needle);
        if has(b"/JavaScript") || has(b"/Launch") {
            return Some("this PDF contains active content (JavaScript or launch actions) and cannot be archived — please upload a clean PDF");
        }
    }
    None
}

#[allow(clippy::too_many_arguments)]
async fn ingest_pipeline(
    state: web::Data<AppState>,
    user: &UserCtx,
    form: UploadForm,
    existing_submission: Option<Uuid>,
) -> Result<Value, HttpResponse> {
    let file_hash = sha256_hex_of(&form.file_bytes);
    let client = state.pool.get().await.map_err(|e| e500("db pool", e))?;

    // duplicate detection by content hash — same bytes are the same document
    if let Ok(Some(row)) = client
        .query_opt("SELECT submission_id FROM versions WHERE file_hash = $1", &[&file_hash])
        .await
    {
        let sub: Uuid = row.get(0);
        return Err(err_json(
            409,
            &format!("this exact file is already deposited (submission {sub})"),
        ));
    }

    // keep original bytes on disk too (uploads/ is the scratch layer)
    let _ = std::fs::create_dir_all("./uploads");
    let stored_name = format!("{}-{}", Uuid::new_v4(), form.filename);
    let stored_path = format!("./uploads/{stored_name}");
    tokio::fs::write(&stored_path, &form.file_bytes)
        .await
        .map_err(|e| e500("save upload", e))?;

    let text = extract_text(&stored_path).await.unwrap_or_default();

    // Pre-generate ids so the independent slow steps can run concurrently
    // before any DB write. For a revision we still need the prior version.
    let version_id = Uuid::new_v4();
    let (submission_id, version_no, previous_version_id) = match existing_submission {
        Some(sub_id) => {
            let row = client
                .query_one(
                    "SELECT current_version_id, (SELECT COALESCE(MAX(version_no), 0) FROM versions WHERE submission_id = $1) FROM submissions WHERE id = $1",
                    &[&sub_id],
                )
                .await
                .map_err(|e| e500("load submission", e))?;
            let prev: Option<Uuid> = row.get(0);
            let max_no: i32 = row.get(1);
            (sub_id, max_no + 1, prev)
        }
        None => (Uuid::new_v4(), 1, None),
    };

    // Phase 1 — metadata extraction (Groq), the file pin (IPFS), and similarity
    // screening are mutually independent, so run them together instead of end
    // to end. Similarity runs before ingest and self-excludes by submission_id,
    // so nothing unchecked enters the record (restructure.md §5).
    let pin_bytes = form.file_bytes.clone();
    let pin_name = form.filename.clone();
    let pin_file = async move {
        match ipfs::pin_bytes(pin_bytes, &pin_name).await {
            Ok(cid) => cid,
            Err(e) => {
                eprintln!("[ipfs] pin failed (continuing without): {e}");
                String::new()
            }
        }
    };
    let sub_str = submission_id.to_string();
    let uid_str = user.id.to_string();
    let inst_str = user.institution_id.map(|u| u.to_string()).unwrap_or_default();
    let (mut meta, cid, similarity_result) = tokio::join!(
        extract_academic_metadata(&text, &form.filename),
        pin_file,
        vecsvc::similarity(&sub_str, &uid_str, &text),
    );

    // user-supplied fields win over extracted ones
    if let Some(t) = form.fields.get("title").filter(|t| !t.is_empty()) {
        meta.title = t.clone();
    }
    if let Some(d) = form.fields.get("discipline").filter(|d| !d.is_empty()) {
        meta.discipline = d.clone();
    }
    if let Some(l) = form.fields.get("language").filter(|l| !l.is_empty()) {
        meta.language = l.clone();
    }
    if meta.authors.is_empty() {
        meta.authors = user.display_name.clone();
    }
    let license = form
        .fields
        .get("license")
        .filter(|l| !l.is_empty())
        .cloned()
        .unwrap_or_else(|| "CC-BY-4.0".to_string());
    let visibility = match form.fields.get("visibility").map(String::as_str) {
        Some("embargoed") => "embargoed",
        Some("metadata_only") => "metadata_only",
        _ => "public",
    };
    let embargo_until: Option<NaiveDate> = form
        .fields
        .get("embargo_until")
        .and_then(|d| d.parse().ok());

    // DB writes, now that metadata + cid are ready
    if existing_submission.is_none() {
        let doi = format!("10.5555/blockscribe.{}", &submission_id.to_string()[..8]);
        client
            .execute(
                "INSERT INTO submissions (id, institution_id, corresponding_author_id, title, discipline, language, visibility, license, embargo_until, doi, authors, abstract_text, keywords)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
                &[&submission_id, &user.institution_id, &user.id, &meta.title, &meta.discipline, &meta.language,
                  &visibility, &license, &embargo_until, &doi, &meta.authors, &meta.abstract_text, &meta.keywords],
            )
            .await
            .map_err(|e| e500("insert submission", e))?;
    }

    client
        .execute(
            "INSERT INTO versions (id, submission_id, version_no, file_hash, cid, status, previous_version_id, extracted_text, original_filename)
             VALUES ($1, $2, $3, $4, $5, 'submitted', $6, $7, $8)",
            &[&version_id, &submission_id, &version_no, &file_hash, &cid, &previous_version_id, &text, &form.filename],
        )
        .await
        .map_err(|e| e500("insert version", e))?;
    client
        .execute("UPDATE submissions SET current_version_id = $1 WHERE id = $2", &[&version_id, &submission_id])
        .await
        .map_err(|e| e500("set current version", e))?;

    // persist the similarity run (needs the version row to exist for the FK)
    let similarity = match similarity_result {
        Ok(report) => {
            let run_id = Uuid::new_v4();
            let _ = client
                .execute(
                    "INSERT INTO similarity_runs (id, version_id, model, threshold, max_score, flagged_chunks, total_chunks, report)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    &[
                        &run_id,
                        &version_id,
                        &report["model"].as_str().unwrap_or(""),
                        &(report["threshold"].as_f64().unwrap_or(0.82) as f32),
                        &(report["max_score"].as_f64().unwrap_or(0.0) as f32),
                        &(report["flagged_chunks"].as_i64().unwrap_or(0) as i32),
                        &(report["total_chunks"].as_i64().unwrap_or(0) as i32),
                        &report,
                    ],
                )
                .await;
            report
        }
        Err(e) => {
            eprintln!("[vector] similarity failed (continuing): {e}");
            json!({"error": e.to_string()})
        }
    };

    // supersede the previous version
    if let Some(prev) = previous_version_id {
        let _ = client
            .execute("UPDATE versions SET status = 'superseded' WHERE id = $1", &[&prev])
            .await;
        let _ = vecsvc::set_status(&prev.to_string(), "superseded").await;
        let prev_hash: String = client
            .query_one("SELECT file_hash FROM versions WHERE id = $1", &[&prev])
            .await
            .map(|r| r.get(0))
            .unwrap_or_default();
        record_anchor(&state, prev, "supersede", json!({"hash": prev_hash, "next": file_hash})).await;
    }

    // At this point the deposit is fully durable (Postgres + IPFS file) and the
    // author has their metadata + similarity report. The remaining work — pinning
    // the metadata JSON, ingesting vectors into the search index (a rebuildable
    // cache), and anchoring on-chain — is deferred to a background task so the
    // response returns fast. The PDA is derived deterministically now; the memo
    // tx confirms a moment later, and /api/admin/reanchor reconciles it if the
    // chain was unreachable (restructure.md §5, §8, §15).
    let metadata_json = json!({
        "title": meta.title, "authors": meta.authors, "abstract": meta.abstract_text,
        "discipline": meta.discipline, "keywords": meta.keywords, "language": meta.language,
        "license": license, "file_hash": file_hash, "cid": cid, "version_no": version_no,
        "institution": institution_name(),
    });
    let pda = chain::derive_document_pda(&file_hash)
        .map(|(addr, _)| addr)
        .unwrap_or_default();
    {
        let state = state.clone();
        let meta_bytes = metadata_json.to_string().into_bytes();
        let vid_str = version_id.to_string();
        let (sub_str, uid_str, inst_str) = (sub_str.clone(), uid_str.clone(), inst_str.clone());
        let (text, title, discipline, language) =
            (text.clone(), meta.title.clone(), meta.discipline.clone(), meta.language.clone());
        let (file_hash, cid, uploader) = (file_hash.clone(), cid.clone(), user.custodial_pubkey.clone());
        tokio::spawn(async move {
            let (metadata_cid_res, ingest_res) = tokio::join!(
                ipfs::pin_bytes(meta_bytes, "metadata.json"),
                vecsvc::ingest(&vid_str, &sub_str, &uid_str, &inst_str, &text, &title, &discipline, &language),
            );
            let metadata_cid = metadata_cid_res.unwrap_or_default();
            if let Err(e) = ingest_res {
                eprintln!("[vector] ingest failed (continuing): {e}");
            }
            if let Ok(client) = state.pool.get().await {
                let _ = client
                    .execute("UPDATE versions SET metadata_cid = $1 WHERE id = $2", &[&metadata_cid, &version_id])
                    .await;
            }
            let memo = json!({
                "hash": file_hash, "cid": cid, "meta_cid": metadata_cid,
                "uploader": uploader, "version": version_no,
            });
            record_anchor(&state, version_id, "anchor_submission", memo).await;
        });
    }
    let anchor = json!({"status": "processing", "pda_address": pda});

    Ok(json!({
        "submission_id": submission_id.to_string(),
        "version_id": version_id.to_string(),
        "version_no": version_no,
        "title": meta.title,
        "authors": meta.authors,
        "abstract": meta.abstract_text,
        "discipline": meta.discipline,
        "file_hash": file_hash,
        "cid": cid,
        "metadata_cid": "",
        "similarity": {
            "max_score": similarity["max_score"],
            "flagged_chunks": similarity["flagged_chunks"],
            "total_chunks": similarity["total_chunks"],
            "passages": similarity["passages"].as_array().map(|p| p.len()).unwrap_or(0),
        },
        "anchor": anchor,
    }))
}

#[post("/api/submissions")]
async fn create_submission(state: web::Data<AppState>, req: HttpRequest, payload: Multipart) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "log in to deposit a paper");
    };
    let form = match read_multipart(payload).await {
        Ok(f) => f,
        Err(resp) => return resp,
    };
    match ingest_pipeline(state.clone(), &user, form, None).await {
        Ok(v) => HttpResponse::Ok().json(v),
        Err(resp) => resp,
    }
}

/// Optional pre-flight check: run similarity against the whole corpus WITHOUT
/// depositing, ingesting, or anchoring anything. Lets an author see what an
/// editor would see before they commit to a deposit.
#[post("/api/plagiarism-check")]
async fn plagiarism_check(state: web::Data<AppState>, req: HttpRequest, payload: Multipart) -> impl Responder {
    let Some(_user) = auth_user(&state, &req).await else {
        return err_json(401, "log in to run a check");
    };
    let form = match read_multipart(payload).await {
        Ok(f) => f,
        Err(resp) => return resp,
    };
    let text = extract_text_from_bytes(&form.file_bytes);
    if text.trim().is_empty() {
        return err_json(400, "could not read any text from this file");
    }
    let file_hash = sha256_hex_of(&form.file_bytes);

    // If this exact file is already deposited, exclude it so the report shows
    // OTHER matches rather than a 100% self-match, and flag that fact.
    let already: Option<Uuid> = match state.pool.get().await {
        Ok(client) => client
            .query_opt("SELECT submission_id FROM versions WHERE file_hash = $1", &[&file_hash])
            .await
            .ok()
            .flatten()
            .map(|r| r.get(0)),
        Err(e) => return e500("db pool", e),
    };
    let exclude_submission = already.map(|s| s.to_string()).unwrap_or_else(|| Uuid::new_v4().to_string());

    match vecsvc::similarity(&exclude_submission, "", &text).await {
        Ok(mut report) => {
            report["already_deposited"] = json!(already.is_some());
            report["file_hash"] = json!(file_hash);
            HttpResponse::Ok().json(report)
        }
        Err(e) => e500("similarity check", e),
    }
}

#[post("/api/submissions/{id}/versions")]
async fn create_version(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<Uuid>,
    payload: Multipart,
) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "log in to submit a revision");
    };
    let submission_id = path.into_inner();
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let owner: Option<Uuid> = match client
        .query_opt("SELECT corresponding_author_id FROM submissions WHERE id = $1", &[&submission_id])
        .await
    {
        Ok(Some(row)) => row.get(0),
        Ok(None) => return err_json(404, "submission not found"),
        Err(e) => return e500("load submission", e),
    };
    if owner != Some(user.id) && user.role != "editor" {
        return err_json(403, "only the corresponding author or an editor can submit revisions");
    }
    let form = match read_multipart(payload).await {
        Ok(f) => f,
        Err(resp) => return resp,
    };
    match ingest_pipeline(state.clone(), &user, form, Some(submission_id)).await {
        Ok(v) => HttpResponse::Ok().json(v),
        Err(resp) => resp,
    }
}

// ---------- detail / verify / search ----------

#[get("/api/submissions/{id}")]
async fn submission_detail(state: web::Data<AppState>, req: HttpRequest, path: web::Path<Uuid>) -> impl Responder {
    let id = path.into_inner();
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let row = match client
        .query_opt(&format!("{SUBMISSION_SELECT} WHERE s.id = $1"), &[&id])
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return err_json(404, "submission not found"),
        Err(e) => return e500("load submission", e),
    };
    let mut base = submission_row_json(&row);
    let viewer = auth_user(&state, &req).await;
    let is_editor = viewer.as_ref().map(|u| u.role == "editor").unwrap_or(false);
    let is_author = viewer
        .as_ref()
        .map(|u| base["author_id"] == json!(u.id.to_string()))
        .unwrap_or(false);

    let versions = client
        .query(
            "SELECT id, version_no, file_hash, cid, metadata_cid, status, pda_address, created_at, previous_version_id
             FROM versions WHERE submission_id = $1 ORDER BY version_no",
            &[&id],
        )
        .await
        .unwrap_or_default();
    let version_ids: Vec<Uuid> = versions.iter().map(|r| r.get::<_, Uuid>(0)).collect();

    let anchors = client
        .query(
            "SELECT version_id, instruction, pda_address, signature, slot, status, confirmed_at
             FROM anchors WHERE version_id = ANY($1) ORDER BY COALESCE(confirmed_at, 'epoch')",
            &[&version_ids],
        )
        .await
        .unwrap_or_default();
    let anchors_json: Vec<Value> = anchors
        .iter()
        .map(|r| {
            json!({
                "version_id": r.get::<_, Uuid>(0).to_string(),
                "instruction": r.get::<_, String>(1),
                "pda_address": r.get::<_, String>(2),
                "signature": r.get::<_, String>(3),
                "slot": r.get::<_, i64>(4),
                "status": r.get::<_, String>(5),
                "confirmed_at": r.get::<_, Option<DateTime<Utc>>>(6).map(|d| d.to_rfc3339()),
            })
        })
        .collect();

    let versions_json: Vec<Value> = versions
        .iter()
        .map(|r| {
            json!({
                "id": r.get::<_, Uuid>(0).to_string(),
                "version_no": r.get::<_, i32>(1),
                "file_hash": r.get::<_, String>(2),
                "cid": r.get::<_, String>(3),
                "metadata_cid": r.get::<_, String>(4),
                "status": r.get::<_, String>(5),
                "pda_address": r.get::<_, String>(6),
                "created_at": r.get::<_, DateTime<Utc>>(7).to_rfc3339(),
                "previous_version_id": r.get::<_, Option<Uuid>>(8).map(|u| u.to_string()),
            })
        })
        .collect();

    // reviews: blind by default — identity revealed only to editors
    let reviews = client
        .query(
            "SELECT rv.id, a.version_id, rv.recommendation, rv.review_text, rv.review_cid, rv.review_hash,
                    rv.reviewer_signature, rv.signed_at, rv.is_blind, u.display_name
             FROM reviews rv
             JOIN assignments a ON a.id = rv.assignment_id
             JOIN users u ON u.id = a.reviewer_id
             WHERE a.version_id = ANY($1) ORDER BY rv.signed_at",
            &[&version_ids],
        )
        .await
        .unwrap_or_default();
    let reviews_json: Vec<Value> = reviews
        .iter()
        .map(|r| {
            let blind: bool = r.get(8);
            json!({
                "id": r.get::<_, Uuid>(0).to_string(),
                "version_id": r.get::<_, Uuid>(1).to_string(),
                "recommendation": r.get::<_, String>(2),
                "review_text": r.get::<_, String>(3),
                "review_cid": r.get::<_, String>(4),
                "review_hash": r.get::<_, String>(5),
                "reviewer_signature": r.get::<_, String>(6),
                "signed_at": r.get::<_, DateTime<Utc>>(7).to_rfc3339(),
                "reviewer": if blind && !is_editor { "Anonymous reviewer".to_string() } else { r.get::<_, String>(9) },
            })
        })
        .collect();

    // latest similarity summary; full report only for editor/author
    let sim = client
        .query_opt(
            "SELECT model, threshold, max_score, flagged_chunks, total_chunks, report, ran_at
             FROM similarity_runs WHERE version_id = ANY($1) ORDER BY ran_at DESC LIMIT 1",
            &[&version_ids],
        )
        .await
        .ok()
        .flatten();
    let similarity_json = sim.map(|r| {
        let mut v = json!({
            "model": r.get::<_, String>(0),
            "threshold": r.get::<_, f32>(1),
            "max_score": r.get::<_, f32>(2),
            "flagged_chunks": r.get::<_, i32>(3),
            "total_chunks": r.get::<_, i32>(4),
            "ran_at": r.get::<_, DateTime<Utc>>(6).to_rfc3339(),
        });
        if is_editor || is_author {
            v["report"] = r.get::<_, Value>(5);
        }
        v
    });

    let related = vecsvc::related(base["abstract"].as_str().unwrap_or(""), &id.to_string())
        .await
        .ok()
        .and_then(|v| v.get("results").cloned())
        .unwrap_or_else(|| json!([]));

    base["versions"] = json!(versions_json);
    base["anchors"] = json!(anchors_json);
    base["reviews"] = json!(reviews_json);
    base["similarity"] = similarity_json.unwrap_or(Value::Null);
    base["related"] = related;
    HttpResponse::Ok().json(base)
}

/// Public verification: given only a hash, derive the content address and
/// return the record plus its on-chain anchors. No account needed.
#[get("/api/verify")]
async fn verify(state: web::Data<AppState>, query: web::Query<HashMap<String, String>>) -> impl Responder {
    let Some(hash) = query.get("hash").map(|h| h.trim().to_lowercase()) else {
        return err_json(400, "missing 'hash' query param");
    };
    if hash.len() != 64 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return err_json(400, "hash must be 64 hex characters (SHA-256)");
    }
    let pda = chain::derive_document_pda(&hash)
        .map(|(addr, _)| addr)
        .unwrap_or_default();

    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let row = client
        .query_opt(
            "SELECT v.id, v.version_no, v.status, v.created_at, s.id, s.title, s.authors, s.doi, i.name
             FROM versions v JOIN submissions s ON s.id = v.submission_id
             LEFT JOIN institutions i ON i.id = s.institution_id
             WHERE v.file_hash = $1",
            &[&hash],
        )
        .await
        .ok()
        .flatten();

    let Some(row) = row else {
        return HttpResponse::Ok().json(json!({
            "exists": false, "verified": false, "hash": hash, "pda_address": pda,
        }));
    };

    let version_id: Uuid = row.get(0);
    let anchors = client
        .query(
            "SELECT instruction, signature, slot, status, confirmed_at FROM anchors
             WHERE version_id = $1 AND status = 'confirmed' ORDER BY confirmed_at",
            &[&version_id],
        )
        .await
        .unwrap_or_default();
    let anchors_json: Vec<Value> = anchors
        .iter()
        .map(|r| {
            json!({
                "instruction": r.get::<_, String>(0),
                "signature": r.get::<_, String>(1),
                "slot": r.get::<_, i64>(2),
                "status": r.get::<_, String>(3),
                "confirmed_at": r.get::<_, Option<DateTime<Utc>>>(4).map(|d| d.to_rfc3339()),
            })
        })
        .collect();

    HttpResponse::Ok().json(json!({
        "exists": true,
        "verified": !anchors_json.is_empty(),
        "hash": hash,
        "pda_address": pda,
        "record": {
            "version_id": version_id.to_string(),
            "version_no": row.get::<_, i32>(1),
            "status": row.get::<_, String>(2),
            "deposited_at": row.get::<_, DateTime<Utc>>(3).to_rfc3339(),
            "submission_id": row.get::<_, Uuid>(4).to_string(),
            "title": row.get::<_, String>(5),
            "authors": row.get::<_, String>(6),
            "doi": row.get::<_, String>(7),
            "institution": row.get::<_, Option<String>>(8).unwrap_or_default(),
        },
        "anchors": anchors_json,
    }))
}

#[get("/api/search")]
async fn semantic_search(state: web::Data<AppState>, query: web::Query<HashMap<String, String>>) -> impl Responder {
    let q = query.get("q").cloned().unwrap_or_default();
    if q.trim().is_empty() {
        return err_json(400, "missing 'q' query param");
    }
    let k = query.get("k").and_then(|v| v.parse().ok()).unwrap_or(10);

    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };

    match vecsvc::search(&q, k).await {
        Ok(res) => {
            let hits = res["results"].as_array().cloned().unwrap_or_default();
            let ids: Vec<Uuid> = hits
                .iter()
                .filter_map(|h| h["submission_id"].as_str().and_then(|s| s.parse().ok()))
                .collect();
            let rows = client
                .query(&format!("{SUBMISSION_SELECT} WHERE s.id = ANY($1)"), &[&ids])
                .await
                .unwrap_or_default();
            let by_id: HashMap<String, Value> = rows
                .iter()
                .map(|r| (r.get::<_, Uuid>(0).to_string(), submission_row_json(r)))
                .collect();
            let merged: Vec<Value> = hits
                .iter()
                .filter_map(|h| {
                    let sid = h["submission_id"].as_str()?;
                    let mut record = by_id.get(sid)?.clone();
                    record["score"] = h["score"].clone();
                    // retracted work stays findable but clearly labelled
                    Some(record)
                })
                .collect();
            HttpResponse::Ok().json(json!({"mode": "semantic", "results": merged}))
        }
        Err(e) => {
            eprintln!("[vector] search failed, falling back to keyword: {e}");
            let rows = client
                .query(&format!("{SUBMISSION_SELECT} ORDER BY s.created_at DESC LIMIT 500"), &[])
                .await
                .unwrap_or_default();
            let ql = q.to_lowercase();
            let results: Vec<Value> = rows
                .iter()
                .filter(|r| {
                    format!("{} {} {}", r.get::<_, String>(1), r.get::<_, String>(7), r.get::<_, String>(8))
                        .to_lowercase()
                        .contains(&ql)
                })
                .map(submission_row_json)
                .collect();
            HttpResponse::Ok().json(json!({"mode": "keyword", "results": results}))
        }
    }
}

// ---------- review workflow ----------

#[derive(Deserialize)]
struct AssignmentRequest {
    version_id: Uuid,
    reviewer_id: Uuid,
    due_at: Option<NaiveDate>,
}

#[post("/api/assignments")]
async fn create_assignment(state: web::Data<AppState>, req: HttpRequest, body: web::Json<AssignmentRequest>) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };

    // Editors can assign on any submission; a corresponding author can request
    // a review of their own work (e.g. an editor asking a peer editor to review
    // their paper). The author may never be assigned as their own reviewer.
    let author_id: Option<Uuid> = client
        .query_opt(
            "SELECT s.corresponding_author_id FROM versions v JOIN submissions s ON s.id = v.submission_id WHERE v.id = $1",
            &[&body.version_id],
        )
        .await
        .ok()
        .flatten()
        .and_then(|r| r.get(0));
    let is_author = author_id == Some(user.id);
    if user.role != "editor" && !is_author {
        return err_json(403, "only an editor or the paper's corresponding author can request a review");
    }
    if author_id == Some(body.reviewer_id) {
        return err_json(400, "the author cannot be assigned as their own reviewer");
    }
    // avoid duplicate active assignments to the same reviewer
    if let Ok(Some(_)) = client
        .query_opt(
            "SELECT 1 FROM assignments WHERE version_id = $1 AND reviewer_id = $2 AND state <> 'completed'",
            &[&body.version_id, &body.reviewer_id],
        )
        .await
    {
        return err_json(409, "this reviewer is already assigned to this version");
    }

    let id = Uuid::new_v4();
    if let Err(e) = client
        .execute(
            "INSERT INTO assignments (id, version_id, reviewer_id, due_at) VALUES ($1, $2, $3, $4)",
            &[&id, &body.version_id, &body.reviewer_id, &body.due_at],
        )
        .await
    {
        return e500("create assignment", e);
    }
    let _ = client
        .execute(
            "UPDATE versions SET status = 'under_review' WHERE id = $1 AND status = 'submitted'",
            &[&body.version_id],
        )
        .await;
    let _ = vecsvc::set_status(&body.version_id.to_string(), "under_review").await;
    let hash: String = client
        .query_one("SELECT file_hash FROM versions WHERE id = $1", &[&body.version_id])
        .await
        .map(|r| r.get(0))
        .unwrap_or_default();
    let anchor = record_anchor(&state, body.version_id, "set_under_review", json!({"hash": hash})).await;
    HttpResponse::Ok().json(json!({"assignment_id": id.to_string(), "anchor": anchor}))
}

#[get("/api/assignments/mine")]
async fn my_assignments(state: web::Data<AppState>, req: HttpRequest) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let rows = client
        .query(
            "SELECT a.id, a.version_id, a.state, a.due_at, a.assigned_at, s.title, s.id, v.version_no, v.status
             FROM assignments a
             JOIN versions v ON v.id = a.version_id
             JOIN submissions s ON s.id = v.submission_id
             WHERE a.reviewer_id = $1 ORDER BY a.assigned_at DESC",
            &[&user.id],
        )
        .await
        .unwrap_or_default();
    HttpResponse::Ok().json(
        rows.iter()
            .map(|r| {
                json!({
                    "id": r.get::<_, Uuid>(0).to_string(),
                    "version_id": r.get::<_, Uuid>(1).to_string(),
                    "state": r.get::<_, String>(2),
                    "due_at": r.get::<_, Option<NaiveDate>>(3).map(|d| d.to_string()),
                    "assigned_at": r.get::<_, DateTime<Utc>>(4).to_rfc3339(),
                    "title": r.get::<_, String>(5),
                    "submission_id": r.get::<_, Uuid>(6).to_string(),
                    "version_no": r.get::<_, i32>(7),
                    "version_status": r.get::<_, String>(8),
                })
            })
            .collect::<Vec<_>>(),
    )
}

#[derive(Deserialize)]
struct ReviewRequest {
    assignment_id: Uuid,
    text: String,
    recommendation: String,
}

#[post("/api/reviews")]
async fn submit_review(state: web::Data<AppState>, req: HttpRequest, body: web::Json<ReviewRequest>) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    if body.text.trim().is_empty() {
        return err_json(400, "review text is required");
    }
    let recommendation = match body.recommendation.as_str() {
        r @ ("accept" | "minor_revisions" | "major_revisions" | "reject") => r,
        _ => return err_json(400, "recommendation must be accept|minor_revisions|major_revisions|reject"),
    };
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let row = match client
        .query_opt(
            "SELECT reviewer_id, version_id FROM assignments WHERE id = $1",
            &[&body.assignment_id],
        )
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return err_json(404, "assignment not found"),
        Err(e) => return e500("load assignment", e),
    };
    let reviewer_id: Uuid = row.get(0);
    let version_id: Uuid = row.get(1);
    if reviewer_id != user.id {
        return err_json(403, "this assignment belongs to another reviewer");
    }

    // review text to IPFS; its hash is anchored; the reviewer signs the
    // attestation with their custodial key (restructure.md §8)
    let review_hash = sha256_hex_of(body.text.as_bytes());
    let review_cid = ipfs::pin_bytes(body.text.clone().into_bytes(), "review.txt")
        .await
        .unwrap_or_default();
    let signature = user
        .custodial_secret
        .as_deref()
        .and_then(|s| chain::sign_with_secret(s, review_hash.as_bytes()).ok())
        .unwrap_or_default();

    let review_id = Uuid::new_v4();
    if let Err(e) = client
        .execute(
            "INSERT INTO reviews (id, assignment_id, review_cid, review_hash, review_text, recommendation, reviewer_signature)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
            &[&review_id, &body.assignment_id, &review_cid, &review_hash, &body.text, &recommendation, &signature],
        )
        .await
    {
        return e500("insert review", e);
    }
    let _ = client
        .execute("UPDATE assignments SET state = 'completed' WHERE id = $1", &[&body.assignment_id])
        .await;
    let _ = client
        .execute(
            "UPDATE versions SET status = 'reviewed' WHERE id = $1 AND status IN ('submitted', 'under_review')",
            &[&version_id],
        )
        .await;
    let _ = vecsvc::set_status(&version_id.to_string(), "reviewed").await;

    let file_hash: String = client
        .query_one("SELECT file_hash FROM versions WHERE id = $1", &[&version_id])
        .await
        .map(|r| r.get(0))
        .unwrap_or_default();
    let anchor = record_anchor(
        &state,
        version_id,
        "attach_review",
        json!({"hash": file_hash, "review_hash": review_hash, "review_cid": review_cid, "reviewer_sig": signature}),
    )
    .await;
    let _ = client
        .execute("UPDATE reviews SET anchor_signature = $1 WHERE id = $2",
                 &[&anchor["signature"].as_str().unwrap_or(""), &review_id])
        .await;

    HttpResponse::Ok().json(json!({"review_id": review_id.to_string(), "review_hash": review_hash, "anchor": anchor}))
}

// ---------- lifecycle transitions ----------

async fn transition(
    state: &AppState,
    req: &HttpRequest,
    version_id: Uuid,
    new_status: &str,
    instruction: &str,
    extra: Value,
) -> HttpResponse {
    let Some(user) = auth_user(state, req).await else {
        return err_json(401, "not logged in");
    };
    if user.role != "editor" {
        return err_json(403, "only editors can change publication status");
    }
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let updated = match client
        .execute("UPDATE versions SET status = $1 WHERE id = $2", &[&new_status, &version_id])
        .await
    {
        Ok(n) => n,
        Err(e) => return e500("update status", e),
    };
    if updated == 0 {
        return err_json(404, "version not found");
    }
    let _ = vecsvc::set_status(&version_id.to_string(), new_status).await;
    let hash: String = client
        .query_one("SELECT file_hash FROM versions WHERE id = $1", &[&version_id])
        .await
        .map(|r| r.get(0))
        .unwrap_or_default();
    let mut memo = extra;
    memo["hash"] = json!(hash);
    let anchor = record_anchor(state, version_id, instruction, memo).await;
    HttpResponse::Ok().json(json!({"status": new_status, "anchor": anchor}))
}

#[post("/api/versions/{id}/publish")]
async fn publish_version(state: web::Data<AppState>, req: HttpRequest, path: web::Path<Uuid>) -> impl Responder {
    transition(&state, &req, path.into_inner(), "published", "publish", json!({})).await
}

#[derive(Deserialize)]
struct RetractRequest {
    reason: String,
}

/// You cannot delete from a blockchain, but you can append: retraction is a
/// status change plus a reason CID, permanently readable (restructure.md §8).
#[post("/api/versions/{id}/retract")]
async fn retract_version(
    state: web::Data<AppState>,
    req: HttpRequest,
    path: web::Path<Uuid>,
    body: web::Json<RetractRequest>,
) -> impl Responder {
    let version_id = path.into_inner();
    let reason = body.reason.trim().to_string();
    if reason.is_empty() {
        return err_json(400, "a retraction reason is required");
    }
    let reason_cid = ipfs::pin_bytes(reason.clone().into_bytes(), "retraction.txt")
        .await
        .unwrap_or_default();

    let resp = transition(
        &state,
        &req,
        version_id,
        "retracted",
        "retract",
        json!({"reason_cid": reason_cid}),
    )
    .await;

    if resp.status().is_success() {
        if let (Ok(client), Some(user)) = (state.pool.get().await, auth_user(&state, &req).await) {
            let _ = client
                .execute(
                    "INSERT INTO retractions (version_id, reason, reason_cid, retracted_by)
                     VALUES ($1, $2, $3, $4) ON CONFLICT (version_id) DO NOTHING",
                    &[&version_id, &reason, &reason_cid, &user.id],
                )
                .await;
        }
    }
    resp
}

// ---------- editor tools ----------

#[get("/api/reviewers/match")]
async fn reviewer_match(state: web::Data<AppState>, req: HttpRequest, query: web::Query<HashMap<String, String>>) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    if user.role != "editor" {
        return err_json(403, "only editors match reviewers");
    }
    let Some(submission_id) = query.get("submission_id").and_then(|s| s.parse::<Uuid>().ok()) else {
        return err_json(400, "missing submission_id");
    };
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let row = match client
        .query_opt(
            "SELECT abstract_text, corresponding_author_id FROM submissions WHERE id = $1",
            &[&submission_id],
        )
        .await
    {
        Ok(Some(r)) => r,
        Ok(None) => return err_json(404, "submission not found"),
        Err(e) => return e500("load submission", e),
    };
    let abstract_text: String = row.get(0);
    let author_id: Option<Uuid> = row.get(1);
    // conflicts: the author can never review their own paper
    let exclude = author_id.map(|u| vec![u.to_string()]).unwrap_or_default();

    match vecsvc::match_reviewers(&abstract_text, exclude).await {
        Ok(res) => {
            let hits = res["results"].as_array().cloned().unwrap_or_default();
            let ids: Vec<Uuid> = hits
                .iter()
                .filter_map(|h| h["user_id"].as_str().and_then(|s| s.parse().ok()))
                .collect();
            let rows = client
                .query("SELECT id, display_name, email FROM users WHERE id = ANY($1)", &[&ids])
                .await
                .unwrap_or_default();
            let by_id: HashMap<String, (String, String)> = rows
                .iter()
                .map(|r| (r.get::<_, Uuid>(0).to_string(), (r.get(1), r.get(2))))
                .collect();
            let candidates: Vec<Value> = hits
                .iter()
                .filter_map(|h| {
                    let uid = h["user_id"].as_str()?;
                    let (name, email) = by_id.get(uid)?;
                    Some(json!({
                        "user_id": uid, "display_name": name, "email": email,
                        "score": h["score"], "evidence_submission_id": h["evidence_submission_id"],
                    }))
                })
                .collect();
            HttpResponse::Ok().json(json!({"candidates": candidates}))
        }
        Err(e) => e500("reviewer matching", e),
    }
}

#[get("/api/similarity/{version_id}")]
async fn similarity_report(state: web::Data<AppState>, req: HttpRequest, path: web::Path<Uuid>) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    let version_id = path.into_inner();
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let author: Option<Uuid> = client
        .query_opt(
            "SELECT s.corresponding_author_id FROM versions v JOIN submissions s ON s.id = v.submission_id WHERE v.id = $1",
            &[&version_id],
        )
        .await
        .ok()
        .flatten()
        .and_then(|r| r.get(0));
    if user.role != "editor" && author != Some(user.id) {
        return err_json(403, "similarity reports are visible to editors and the author");
    }
    match client
        .query_opt(
            "SELECT model, threshold, max_score, flagged_chunks, total_chunks, report, ran_at
             FROM similarity_runs WHERE version_id = $1 ORDER BY ran_at DESC LIMIT 1",
            &[&version_id],
        )
        .await
    {
        Ok(Some(r)) => HttpResponse::Ok().json(json!({
            "model": r.get::<_, String>(0),
            "threshold": r.get::<_, f32>(1),
            "max_score": r.get::<_, f32>(2),
            "flagged_chunks": r.get::<_, i32>(3),
            "total_chunks": r.get::<_, i32>(4),
            "report": r.get::<_, Value>(5),
            "ran_at": r.get::<_, DateTime<Utc>>(6).to_rfc3339(),
        })),
        Ok(None) => err_json(404, "no similarity run for this version"),
        Err(e) => e500("load similarity", e),
    }
}

/// Reconciliation (restructure.md §15): retry every anchor that never
/// confirmed. A deposit made while the chain was unreachable heals here.
#[post("/api/admin/reanchor")]
async fn reanchor(state: web::Data<AppState>, req: HttpRequest) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    if user.role != "editor" {
        return err_json(403, "only editors run reconciliation");
    }
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let rows = client
        .query(
            "SELECT id, memo FROM anchors WHERE status IN ('pending', 'unanchored') ORDER BY id",
            &[],
        )
        .await
        .unwrap_or_default();
    let mut confirmed = 0;
    let mut failed = 0;
    for row in &rows {
        let anchor_id: Uuid = row.get(0);
        let memo: Value = row.get(1);
        match chain::anchor_memo(&state.fee_payer, &memo).await {
            Ok(res) => {
                let _ = client
                    .execute(
                        "UPDATE anchors SET signature = $1, slot = $2, status = 'confirmed', confirmed_at = now() WHERE id = $3",
                        &[&res.signature, &res.slot, &anchor_id],
                    )
                    .await;
                confirmed += 1;
            }
            Err(e) => {
                eprintln!("[reanchor] {anchor_id} still failing: {e}");
                failed += 1;
            }
        }
    }
    HttpResponse::Ok().json(json!({"retried": rows.len(), "confirmed": confirmed, "still_failing": failed}))
}

/// Rebuild the vector index from stored text — proves the index is a cache,
/// not a second source of truth (restructure.md §5).
#[post("/api/admin/rebuild-index")]
async fn rebuild_index(state: web::Data<AppState>, req: HttpRequest) -> impl Responder {
    let Some(user) = auth_user(&state, &req).await else {
        return err_json(401, "not logged in");
    };
    if user.role != "editor" {
        return err_json(403, "only editors rebuild the index");
    }
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let rows = client
        .query(
            "SELECT v.id, v.submission_id, v.extracted_text, v.status, s.title, s.discipline, s.language,
                    s.corresponding_author_id, s.institution_id
             FROM versions v JOIN submissions s ON s.id = v.submission_id",
            &[],
        )
        .await
        .unwrap_or_default();
    let records: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "version_id": r.get::<_, Uuid>(0).to_string(),
                "submission_id": r.get::<_, Uuid>(1).to_string(),
                "text": r.get::<_, String>(2),
                "status": r.get::<_, String>(3),
                "title": r.get::<_, String>(4),
                "discipline": r.get::<_, String>(5),
                "language": r.get::<_, String>(6),
                "uploader_id": r.get::<_, Option<Uuid>>(7).map(|u| u.to_string()).unwrap_or_default(),
                "institution_id": r.get::<_, Option<Uuid>>(8).map(|u| u.to_string()).unwrap_or_default(),
            })
        })
        .collect();
    match vecsvc::rebuild(records).await {
        Ok(v) => HttpResponse::Ok().json(v),
        Err(e) => e500("rebuild index", e),
    }
}

// ---------- discoverability / ops ----------

#[get("/oai")]
async fn oai_endpoint(state: web::Data<AppState>, query: web::Query<HashMap<String, String>>) -> impl Responder {
    let verb = query.get("verb").cloned().unwrap_or_else(|| "Identify".to_string());
    let identifier = query.get("identifier").map(String::as_str);
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let rows = client
        .query(
            "SELECT s.id, s.title, s.authors, s.abstract_text, s.discipline, s.language, s.license, s.doi, v.cid, s.created_at
             FROM submissions s JOIN versions v ON v.id = s.current_version_id
             WHERE v.status = 'published' AND s.visibility <> 'metadata_only'
             ORDER BY s.created_at",
            &[],
        )
        .await
        .unwrap_or_default();
    let records: Vec<oai::OaiRecord> = rows
        .iter()
        .map(|r| oai::OaiRecord {
            id: r.get::<_, Uuid>(0).to_string(),
            title: r.get(1),
            authors: r.get(2),
            abstract_text: r.get(3),
            discipline: r.get(4),
            language: r.get(5),
            license: r.get(6),
            doi: r.get(7),
            cid: r.get(8),
            created_at: r.get(9),
        })
        .collect();
    let xml = oai::respond(&verb, identifier, &records, &public_base_url(), &institution_name());
    HttpResponse::Ok().content_type("text/xml; charset=utf-8").body(xml)
}

#[get("/api/stats")]
async fn stats(state: web::Data<AppState>) -> impl Responder {
    let client = match state.pool.get().await {
        Ok(c) => c,
        Err(e) => return e500("db pool", e),
    };
    let count = |sql: &'static str| {
        let client = &client;
        async move {
            client
                .query_one(sql, &[])
                .await
                .map(|r| r.get::<_, i64>(0))
                .unwrap_or(0)
        }
    };
    let papers = count("SELECT count(*) FROM submissions").await;
    let versions = count("SELECT count(*) FROM versions").await;
    let anchored = count("SELECT count(*) FROM anchors WHERE status = 'confirmed'").await;
    let reviews = count("SELECT count(*) FROM reviews").await;
    let users = count("SELECT count(*) FROM users").await;
    let published = count("SELECT count(*) FROM versions WHERE status = 'published'").await;
    HttpResponse::Ok().json(json!({
        "papers": papers, "versions": versions, "anchored": anchored,
        "reviews": reviews, "users": users, "published": published,
        "institution": institution_name(),
    }))
}

/// Public component status — a preservation service that publishes its own
/// health is more credible than one that asserts durability (restructure.md §15).
#[get("/api/status")]
async fn component_status(state: web::Data<AppState>) -> impl Responder {
    let db_ok = state.pool.get().await.is_ok();
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .unwrap();
    let python_ok = http
        .get(format!("{}/health", vecsvc::base_url()))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    let ipfs_ok = http
        .post(format!("{}/api/v0/version", ipfs::ipfs_api_url()))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    let chain_ok = http
        .post(chain::rpc_url())
        .json(&json!({"jsonrpc": "2.0", "id": 1, "method": "getVersion"}))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    HttpResponse::Ok().json(json!({
        "database": db_ok, "vector_service": python_ok, "ipfs": ipfs_ok, "solana": chain_ok,
        "fee_payer": bs58::encode(state.fee_payer.verifying_key().as_bytes()).into_string(),
    }))
}

// ---------- main ----------

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenv::dotenv().ok();
    let pool = db::make_pool().expect("invalid DATABASE_URL");

    // Postgres may still be starting (docker compose) — retry briefly
    let mut schema_ok = false;
    for attempt in 1..=15 {
        match db::ensure_schema(&pool).await {
            Ok(()) => {
                schema_ok = true;
                break;
            }
            Err(e) => {
                eprintln!("[startup] waiting for postgres (attempt {attempt}): {e}");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            }
        }
    }
    if !schema_ok {
        eprintln!("[startup] could not reach postgres at {} — start it (docker compose up -d postgres)", db::database_url());
    }

    let fee_payer = chain::load_fee_payer().expect("failed to load or create fee payer keypair");
    println!(
        "Fee payer (institution signer): {}",
        bs58::encode(fee_payer.verifying_key().as_bytes()).into_string()
    );

    let state = web::Data::new(AppState { pool, fee_payer });

    HttpServer::new(move || {
        let cors = Cors::default()
            .allowed_origin_fn(|origin, _| {
                origin
                    .to_str()
                    .map(|v| {
                        v.starts_with("http://0.0.0.0:")
                            || v.starts_with("http://localhost:")
                            || v.starts_with("http://127.0.0.1:")
                    })
                    .unwrap_or(false)
            })
            .allowed_methods(vec!["GET", "POST", "OPTIONS"])
            .allowed_headers(vec![http::header::CONTENT_TYPE, http::header::ACCEPT, http::header::AUTHORIZATION])
            .supports_credentials()
            .max_age(3600);

        App::new()
            .wrap(cors)
            .app_data(state.clone())
            .app_data(web::JsonConfig::default().limit(1024 * 1024))
            .service(login)
            .service(me)
            .service(list_users)
            .service(list_submissions)
            .service(create_submission)
            .service(plagiarism_check)
            .service(create_version)
            .service(submission_detail)
            .service(verify)
            .service(semantic_search)
            .service(create_assignment)
            .service(my_assignments)
            .service(submit_review)
            .service(publish_version)
            .service(retract_version)
            .service(reviewer_match)
            .service(similarity_report)
            .service(rebuild_index)
            .service(reanchor)
            .service(oai_endpoint)
            .service(stats)
            .service(component_status)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
    .bind(("0.0.0.0", 5000))?
    .run()
    .await
}
