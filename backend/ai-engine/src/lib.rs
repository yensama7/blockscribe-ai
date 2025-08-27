pub mod hash;
use std::path::Path;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Cursor};
use serde::{Serialize, Deserialize};
use regex::Regex;
use unicode_normalization::UnicodeNormalization;
use anyhow::Result;
use anyhow::anyhow;

// TODO: add this dependency
use pdfium_render::prelude::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct AiOutput{
    file_hash: String,
    ipfs_cid: String,
    meta: ExtractedMetaData
}


#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedMetaData {
    title: Option<String>,
    keywords: Vec<String>,  // is it really possible to not have any keywords LMAO
    topics: Vec<String>,
    difficulty: String,     // Beginner | intermediate | Advanced etc... yada yada yada; suck your mum
    summary: String,
    resource_type: String,  // Lecture note, text book, research paper slides etc
}
// TODO: add other process functions aswell
pub async fn process_document(path: &Path) -> Result<AiOutput> {

    // read the bytes
    let bytes = fs::read(path)?;
    let file_hash = hash::compute_sha256(&bytes[..]);

    // extract the text
    // TODO: this shut is wayyyy harder than i thought
    let text = extract_text(path, &bytes)?;
    unimplemented!()
}


fn extract_text(path: &Path, bytes: &[u8]) -> Result<String> {
    // im one for always making variables names verbose
    let extension = path.extension().and_then(OsStr::to_str).unwrap_or("").to_lowercase();


    // get the extension type
    match extension.as_str()
    {
        "pdf" =>{
               extract_text(path, bytes)
            },
        "docx" => {
            extract_text(path, bytes)
        },

        "txt" | "md" => Ok(String::from_utf8(bytes.to_vec()).unwrap()),

        _ => Err(anyhow!("Unsupported file extension")),    // to be continued.....
    }
}

fn extract_text_from_pdf(path: &Path) -> Result<String> {}
fn extract_text_from_docx(path: &Path) -> Result<String> {}
