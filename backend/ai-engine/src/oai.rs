//! Minimal OAI-PMH 2.0 endpoint (oai_dc) so Google Scholar, BASE, CORE and
//! OpenAIRE can harvest the catalogue (restructure.md §10).

use chrono::{DateTime, Utc};

pub struct OaiRecord {
    pub id: String,
    pub title: String,
    pub authors: String,
    pub abstract_text: String,
    pub discipline: String,
    pub language: String,
    pub license: String,
    pub doi: String,
    pub cid: String,
    pub created_at: DateTime<Utc>,
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn envelope(verb: &str, base_url: &str, body: String) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>{}</responseDate>
  <request verb="{verb}">{}/oai</request>
  {body}
</OAI-PMH>"#,
        Utc::now().format("%Y-%m-%dT%H:%M:%SZ"),
        esc(base_url),
    )
}

fn record_xml(r: &OaiRecord, base_url: &str) -> String {
    let creators: String = r
        .authors
        .split(',')
        .map(str::trim)
        .filter(|a| !a.is_empty())
        .map(|a| format!("<dc:creator>{}</dc:creator>", esc(a)))
        .collect();
    format!(
        r#"<record>
  <header>
    <identifier>oai:blockscribe:{id}</identifier>
    <datestamp>{date}</datestamp>
  </header>
  <metadata>
    <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>{title}</dc:title>
      {creators}
      <dc:description>{desc}</dc:description>
      <dc:subject>{subject}</dc:subject>
      <dc:language>{lang}</dc:language>
      <dc:rights>{rights}</dc:rights>
      <dc:identifier>{doi}</dc:identifier>
      <dc:identifier>{base}/papers/{id}</dc:identifier>
      <dc:identifier>ipfs://{cid}</dc:identifier>
      <dc:type>Text</dc:type>
    </oai_dc:dc>
  </metadata>
</record>"#,
        id = esc(&r.id),
        date = r.created_at.format("%Y-%m-%dT%H:%M:%SZ"),
        title = esc(&r.title),
        creators = creators,
        desc = esc(&r.abstract_text),
        subject = esc(&r.discipline),
        lang = esc(&r.language),
        rights = esc(&r.license),
        doi = esc(&r.doi),
        base = esc(base_url),
        cid = esc(&r.cid),
    )
}

pub fn respond(verb: &str, identifier: Option<&str>, records: &[OaiRecord], base_url: &str, repo_name: &str) -> String {
    match verb {
        "Identify" => envelope(verb, base_url, format!(
            r#"<Identify>
  <repositoryName>{}</repositoryName>
  <baseURL>{}/oai</baseURL>
  <protocolVersion>2.0</protocolVersion>
  <adminEmail>admin@localhost</adminEmail>
  <earliestDatestamp>2024-01-01T00:00:00Z</earliestDatestamp>
  <deletedRecord>no</deletedRecord>
  <granularity>YYYY-MM-DDThh:mm:ssZ</granularity>
</Identify>"#,
            esc(repo_name), esc(base_url),
        )),
        "ListMetadataFormats" => envelope(verb, base_url, String::from(
            r#"<ListMetadataFormats>
  <metadataFormat>
    <metadataPrefix>oai_dc</metadataPrefix>
    <schema>http://www.openarchives.org/OAI/2.0/oai_dc.xsd</schema>
    <metadataNamespace>http://www.openarchives.org/OAI/2.0/oai_dc/</metadataNamespace>
  </metadataFormat>
</ListMetadataFormats>"#,
        )),
        "ListRecords" => {
            if records.is_empty() {
                return envelope(verb, base_url, r#"<error code="noRecordsMatch">no published records</error>"#.into());
            }
            let body: String = records.iter().map(|r| record_xml(r, base_url)).collect();
            envelope(verb, base_url, format!("<ListRecords>{body}</ListRecords>"))
        }
        "ListIdentifiers" => {
            let body: String = records
                .iter()
                .map(|r| format!(
                    "<header><identifier>oai:blockscribe:{}</identifier><datestamp>{}</datestamp></header>",
                    esc(&r.id), r.created_at.format("%Y-%m-%dT%H:%M:%SZ")))
                .collect();
            envelope(verb, base_url, format!("<ListIdentifiers>{body}</ListIdentifiers>"))
        }
        "GetRecord" => {
            let wanted = identifier.unwrap_or("").trim_start_matches("oai:blockscribe:");
            match records.iter().find(|r| r.id == wanted) {
                Some(r) => envelope(verb, base_url, format!("<GetRecord>{}</GetRecord>", record_xml(r, base_url))),
                None => envelope(verb, base_url, r#"<error code="idDoesNotExist">unknown identifier</error>"#.into()),
            }
        }
        _ => envelope("Identify", base_url, r#"<error code="badVerb">unsupported verb</error>"#.into()),
    }
}
