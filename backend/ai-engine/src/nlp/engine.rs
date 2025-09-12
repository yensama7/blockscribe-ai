// engine.rs : this file contains the code used for extracting the responses needed
use async_openai::{
    config::OpenAIConfig,
    types::{ChatCompletionRequestMessageArgs, CreateChatCompletionRequestArgs, Role},
    Client,
};

use serde_json::Value;
use serder::{Deserialize, Serialize};
use std::fs;
use std::env;
use dotenv::dotenv;
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedMetaData {
    title: Option<String>,
    keywords: Vec<String>,  // is it really possible to not have any keywords LMAO
    topics: Vec<String>,
    difficulty: String,     // Beginner | intermediate | Advanced etc... yada yada yada; suck your mum
    summary: String,
    resource_type: String,  // Lecture note, text book, research paper slides etc
}

#[derive(Debug)]
pub struct AiOutput{
    file_hash: String,
    ipfs_cid: String,
    meta: ExtractedMetaData
}


pub fn create_client() -> Client<OpenAIConfig>
{
    dotenv().ok();      // load the variables from .env
    let api_key = env::var("OPEN_API_KEY")
    .expect("OPEN_API_KEY not set in the .env file");

    let config = OpenAIConfig::new().with_api_key(api_key);
    Client::with_config(config)
}

// extract the metadata using the OpenAI client. Passes the document text as input
// uses one client asynchronously
pub async fn extract_meta_data_from_document(content: String, client: &Client) -> anyhow::Result<ExtractedMetaData>
{
    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4o-mini")
        .messages([
            ChatCompletionRequestMessageArgs::default()
                .role(Role::System)
                .content(
                    "You are an assistant that extracts metadata from academic documents.
                     Always return valid JSON matching the ExtractedMetaData struct.",
                ) // TODO: make a better prompt
                .build()?,
            ChatCompletionRequestMessageArgs::default()
                .role(Role::User)
                .content(format!(
                    "Here is a document:\n{}\n\nPlease extract the metadata.",
                    content
                ))
                .build()?,
        ])
        .build()?;

    // Call OpenAI
    let response = client.chat().create(request).await?;

    let reply = response
        .choices
        .first()
        .and_then(|c| c.message.content.clone())
        .ok_or_else(|| anyhow::anyhow!("No response from AI"))?;

    // Try to parse JSON
    let parsed: ExtractedMetaData = serde_json::from_str(&reply)
        .map_err(|e| anyhow::anyhow!("Invalid JSON response: {}\nReply: {}", e, reply))?;

    Ok(parsed)
}