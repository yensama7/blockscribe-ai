use pdfium_render::prelude::*;
use anyhow::Result;
use anyhow::anyhow;
use std::path::Path;

pub fn extract_text_from_pdf(path: &Path, optional_password: Option<&str>) -> Result<String, PdfiumError> {

    let pdfium = Pdfium::default();

    let document = pdfium.load_pdf_from_file(path, optional_password)?;

    let mut out_text = String::new();

    for (idx, page) in document.pages().iter().enumerate() {

        match page.text()
        {
            Ok(page_text) => {
                todo!()
            },
            Err(e) => {
                todo!()
            }
        }
    }
    Ok(out_text)
}
pub fn extract_text_from_docx(path: &Path, optional_password: Option<&str>) -> Result<String, Error> {}
