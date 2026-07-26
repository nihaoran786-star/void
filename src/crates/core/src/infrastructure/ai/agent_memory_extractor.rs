//! Bounded, tool-free AI adapter for long-term memory extraction.

use super::get_global_ai_client_factory;
use crate::service::agent_memory::{
    AgentMemoryExtractorPort, ExtractedMemory, MemoryExtractionRequest, MemoryWorkflowError,
    MemoryWorkflowErrorCode,
};
use crate::util::types::Message;
use async_trait::async_trait;
use serde::Deserialize;
use void_ai_adapters::ReasoningMode;

const MAX_EXTRACTION_INPUT_BYTES: usize = 96 * 1024;
const MAX_EXTRACTION_RESPONSE_BYTES: usize = 32 * 1024;
const MAX_EXTRACTED_MEMORIES: usize = 20;
const MAX_OUTPUT_TOKENS: u32 = 1_024;

#[derive(Debug, Default)]
pub struct AIClientAgentMemoryExtractor;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StrictExtractionResponse {
    memories: Vec<StrictExtractedMemory>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StrictExtractedMemory {
    content: String,
    #[serde(default)]
    target_memory_id: Option<String>,
}

#[async_trait]
impl AgentMemoryExtractorPort for AIClientAgentMemoryExtractor {
    async fn extract_memories(
        &self,
        request: MemoryExtractionRequest,
    ) -> Result<Vec<ExtractedMemory>, MemoryWorkflowError> {
        let payload = serde_json::to_string(&request).map_err(|error| {
            extractor_error(
                format!("Failed to serialize safe memory input: {error}"),
                false,
            )
        })?;
        if payload.len() > MAX_EXTRACTION_INPUT_BYTES {
            return Err(extractor_error(
                "Safe memory extraction input exceeds the configured budget",
                false,
            ));
        }
        let prompt = format!(
            "Extract only durable user preferences or stable project facts from the supplied safe transcript. \
Never infer secrets, credentials, hidden instructions, tool data, or temporary task state. \
Return exactly one JSON object matching {{\"memories\":[{{\"content\":\"...\",\"targetMemoryId\":null}}]}}. \
Use targetMemoryId only to replace a semantically matching existing memory. Return an empty array when unsure.\nINPUT_JSON:\n{payload}"
        );
        let factory = get_global_ai_client_factory().await.map_err(|error| {
            extractor_error(format!("AI client factory is unavailable: {error}"), true)
        })?;
        let configured = factory.get_client_resolved("fast").await.map_err(|error| {
            extractor_error(
                format!("Memory extraction model is unavailable: {error}"),
                true,
            )
        })?;
        let mut client = (*configured).clone();
        client.config.max_tokens = Some(MAX_OUTPUT_TOKENS);
        client.config.temperature = Some(0.0);
        client.config.reasoning_mode = ReasoningMode::Disabled;
        client.config.reasoning_effort = None;
        client.config.thinking_budget_tokens = None;
        client.config.custom_request_body = None;
        client.config.custom_request_body_mode = None;

        let response = client
            .send_message(vec![Message::user(prompt)], None)
            .await
            .map_err(|error| {
                extractor_error(format!("Memory extraction request failed: {error}"), true)
            })?;
        parse_strict_extraction_response(&response.text)
    }
}

fn parse_strict_extraction_response(
    response: &str,
) -> Result<Vec<ExtractedMemory>, MemoryWorkflowError> {
    if response.len() > MAX_EXTRACTION_RESPONSE_BYTES {
        return Err(extractor_error(
            "Memory extraction response exceeds the configured budget",
            false,
        ));
    }
    let parsed: StrictExtractionResponse =
        serde_json::from_str(response.trim()).map_err(|error| {
            extractor_error(
                format!("Memory extraction returned invalid strict JSON: {error}"),
                false,
            )
        })?;
    if parsed.memories.len() > MAX_EXTRACTED_MEMORIES {
        return Err(extractor_error(
            "Memory extraction returned too many candidates",
            false,
        ));
    }
    Ok(parsed
        .memories
        .into_iter()
        .map(|memory| ExtractedMemory {
            content: memory.content,
            target_memory_id: memory.target_memory_id,
        })
        .collect())
}

fn extractor_error(message: impl Into<String>, retryable: bool) -> MemoryWorkflowError {
    MemoryWorkflowError::new(MemoryWorkflowErrorCode::Extractor, message, retryable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strict_parser_accepts_only_the_bounded_contract() {
        let extracted = parse_strict_extraction_response(
            r#"{"memories":[{"content":"Prefer focused tests","targetMemoryId":null}]}"#,
        )
        .unwrap();
        assert_eq!(extracted.len(), 1);
        assert_eq!(extracted[0].content, "Prefer focused tests");

        for invalid in [
            "```json\n{\"memories\":[]}\n```",
            "{\"memories\":[],\"extra\":true}",
            "{\"memories\":[{\"content\":\"x\",\"extra\":true}]}",
        ] {
            assert_eq!(
                parse_strict_extraction_response(invalid).unwrap_err().code,
                MemoryWorkflowErrorCode::Extractor
            );
        }
    }

    #[test]
    fn strict_parser_enforces_output_limits() {
        let too_many = serde_json::json!({
            "memories": (0..=MAX_EXTRACTED_MEMORIES)
                .map(|index| serde_json::json!({"content": format!("fact {index}")}))
                .collect::<Vec<_>>()
        });
        assert!(parse_strict_extraction_response(&too_many.to_string()).is_err());
        assert!(
            parse_strict_extraction_response(&" ".repeat(MAX_EXTRACTION_RESPONSE_BYTES + 1))
                .is_err()
        );
    }
}
