pub mod chain;
pub mod db;
pub mod ipfs;
pub mod nlp;
pub mod oai;
pub mod vecsvc;

pub use nlp::engine::{AcademicMetadata, compute_sha256_hex, extract_academic_metadata, extract_text, extract_text_from_bytes, sha256_hex_of};
