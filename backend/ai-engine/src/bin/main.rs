// main.rs: This is the server (should've probably called it server.rs lmao)

// server stuff
use actix_web::{post, get, web, App, HttpResponse, HttpServer, Responder};

// structs
use ai_engine::{ExtractedMetaData, FileRecord};

// functionality
use ai_engine::get_meta_data_response;
use ai_engine::package_hash_and_cid;

// the database
use ai_engine::add_to_or_create_database;

// the solana
use ai_engine::send_memo;


// basic page
#[get("/")]
async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello world!")
}


// start the actix server
#[actix_web::main]
async fn main() -> std::io::Result<()>{
    HttpServer::new(|| {
        App::new()
            .service(hello)
            .route("/health", web::get().to(|| async { HttpResponse::Ok().body("OK") }))
    })
        .bind(("127.0.0.1", 5000))?
        .run()
        .await
}