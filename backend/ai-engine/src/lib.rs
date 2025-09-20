mod hash;
pub mod nlp;


use std::path::PathBuf;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Cursor};


use serde_json::{json, Value};
use tokio;
use reqwest::Client;
use regex::Regex;
use anyhow::{anyhow, Context};
use reqwest::multipart::{Form, Part};
use ipfs_api::IpfsClient;
use sha2::{Digest, Sha256};
use std::path::Path;


// structs
pub use nlp::engine::{FileRecord, ExtractedMetaData};
use pdf_extract::extract_text_from_mem;

// we use these two to get the AI response and get the cid and hash for the document
pub use nlp::engine::get_meta_data_response;
pub use nlp::engine::package_hash_and_cid;


// process the document
pub fn extract_text_from_document(path: PathBuf) -> Option<String>
{
    // get the file extension
    let extension = get_extension(&path);


    match extension {
        Some(ext) => {
            if ext == "pdf"
            {
                extract_text_from_pdf(&path)
            }
            else { None }
        }
        None => None
    }

}

fn extract_text_from_pdf(path: &PathBuf) -> Option<String>
{
    let bytes = std::fs::read(&path).unwrap();
    match extract_text_from_mem(&bytes)
    {
        Ok(text) => Some(text),
        Err(err) =>{
            println!("Failed to extract text from {:?}: {}", path, err);
            None
        }
    }
}

fn get_extension(path: &PathBuf) -> Option<String> {
    path.extension()
        .and_then(|ext| ext.to_str())  // convert OsStr → &str
        .map(|s| s.to_string())        // &str → String
}


// #[cfg(test)]
//
// mod tests {
//     use super::*;
//
//     #[test]
//     fn first_read()
//     {
//
//         let result = extract_text_from_document()
//     }
// }
