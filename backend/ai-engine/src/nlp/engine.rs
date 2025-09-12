// engine.rs : this file contains the code used for extracting the responses needed

// extract the metadata using the OpenAI client. Passes the document text as input

use async_openai::{
    config::OpenAIConfig,
    types::{ChatCompletionRequestMessageArgs, CreateChatCompletionRequestArgs, Role},
    Client,
};
use std::env;
use dotenv::dotenv;
#[derive(Debug)]
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

pub async fn send_prompt(prompt: String) -> anyhow::Result<String> {
    let client = create_client();

    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4o-mini")
        .messages([ChatCompletionRequestMessageArgs::default()
            .role(Role::User)
            .content(prompt)
            .build()?
        ]).build()?;


    let response = client.chat().create(request).await?;

    Ok(response.choices[0]
        .message
        .content
        .clone()
        .unwrao_or_else(|| "".to_string()))
}