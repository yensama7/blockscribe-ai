mod hash;
pub mod nlp;
pub mod database;
pub mod solana;

use std::fs;


// structs
pub use nlp::engine::{FileRecord, ExtractedMetaData};

// we use these two to get the AI response and get the cid and hash for the document
pub use nlp::engine::get_meta_data_response;
pub use nlp::engine::package_hash_and_cid;

// the database functionality
pub use database::database::add_to_or_create_database;

// solana blockchain functionality
pub use solana::solana::send_memo;


















// TODO: all the following functions need to be integrated properly
// process the document
// pub fn extract_text_from_document(path: PathBuf) -> Option<String>
// {
//     // get the file extension
//     let extension = get_extension(&path);
//
//
//     match extension {
//         Some(ext) => {
//             if ext == "pdf"
//             {
//                 extract_text_from_pdf(&path)
//             }
//             else { None }
//         }
//         None => None
//     }
//
// }
//
// fn extract_text_from_pdf(path: &PathBuf) -> Option<String>
// {
//     let bytes = std::fs::read(&path).unwrap();
//     match extract_text_from_mem(&bytes)
//     {
//         Ok(text) => Some(text),
//         Err(err) =>{
//             println!("Failed to extract text from {:?}: {}", path, err);
//             None
//         }
//     }
// }
//
// fn get_extension(path: &PathBuf) -> Option<String> {
//     path.extension()
//         .and_then(|ext| ext.to_str())  // convert OsStr → &str
//         .map(|s| s.to_string())        // &str → String
// }


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
