mod hash;
use std::path::PathBuf;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Cursor};

// TODO: add this dependency
use pdf_extract::extract_text_from_mem;


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
