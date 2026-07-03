mod common;

use anyhow::Result;
use common::fixture_loader::load_fixture_bytes;
use common::sse_fixture_server::{FixtureSseServer, FixtureSseServerOptions};
use serde_json::Value;
use std::time::Duration;
use tokio::sync::mpsc;
use void_ai_adapters::stream::{
    handle_anthropic_stream, handle_gemini_stream, handle_openai_stream, handle_responses_stream,
    UnifiedResponse,
};
use void_ai_adapters::tool_call_accumulator::{
    PendingToolCalls, ToolCallBoundary, ToolCallStreamKey,
};

#[derive(Debug)]
struct CapturedToolCall {
    id: String,
    name: String,
    raw_arguments: String,
    arguments: Value,
    is_error: bool,
}

async fn replay_openai_fixture(
    fixture_path: &str,
    inline_think_in_text: bool,
) -> Result<Vec<UnifiedResponse>> {
    let payload = load_fixture_bytes(fixture_path);
    let server = FixtureSseServer::spawn(payload, FixtureSseServerOptions::default()).await;
    let response = reqwest::get(server.url()).await?;
    let (tx_event, mut rx_event) = mpsc::unbounded_channel();

    handle_openai_stream(
        response,
        tx_event,
        None,
        inline_think_in_text,
        None,
        Some(Duration::from_secs(2)),
    )
    .await;

    let mut events = Vec::new();
    while let Some(event) = rx_event.recv().await {
        events.push(event?);
    }
    Ok(events)
}

async fn replay_responses_fixture(fixture_path: &str) -> Result<Vec<UnifiedResponse>> {
    let payload = load_fixture_bytes(fixture_path);
    let server = FixtureSseServer::spawn(payload, FixtureSseServerOptions::default()).await;
    let response = reqwest::get(server.url()).await?;
    let (tx_event, mut rx_event) = mpsc::unbounded_channel();

    handle_responses_stream(response, tx_event, None, None, Some(Duration::from_secs(2))).await;

    let mut events = Vec::new();
    while let Some(event) = rx_event.recv().await {
        events.push(event?);
    }
    Ok(events)
}

async fn replay_anthropic_fixture(fixture_path: &str) -> Result<Vec<UnifiedResponse>> {
    let payload = load_fixture_bytes(fixture_path);
    let server = FixtureSseServer::spawn(payload, FixtureSseServerOptions::default()).await;
    let response = reqwest::get(server.url()).await?;
    let (tx_event, mut rx_event) = mpsc::unbounded_channel();

    handle_anthropic_stream(response, tx_event, None, false, None, Some(Duration::from_secs(2)))
        .await;

    let mut events = Vec::new();
    while let Some(event) = rx_event.recv().await {
        events.push(event?);
    }
    Ok(events)
}

async fn replay_gemini_fixture(fixture_path: &str) -> Result<Vec<UnifiedResponse>> {
    let payload = load_fixture_bytes(fixture_path);
    let server = FixtureSseServer::spawn(payload, FixtureSseServerOptions::default()).await;
    let response = reqwest::get(server.url()).await?;
    let (tx_event, mut rx_event) = mpsc::unbounded_channel();

    handle_gemini_stream(response, tx_event, None, None, Some(Duration::from_secs(2))).await;

    let mut events = Vec::new();
    while let Some(event) = rx_event.recv().await {
        events.push(event?);
    }
    Ok(events)
}

fn captured_tool_calls(events: &[UnifiedResponse]) -> Vec<CapturedToolCall> {
    let mut pending = PendingToolCalls::default();
    let mut captured = Vec::new();

    for event in events {
        if let Some(tool_call) = event.tool_call.as_ref() {
            let outcome = pending.apply_delta(
                ToolCallStreamKey::from(tool_call.tool_call_index),
                tool_call.id.clone(),
                tool_call.name.clone(),
                tool_call.arguments.clone(),
                tool_call.arguments_is_snapshot,
            );
            if let Some(finalized) = outcome.finalized_previous {
                captured.push(CapturedToolCall {
                    id: finalized.tool_id,
                    name: finalized.tool_name,
                    raw_arguments: finalized.raw_arguments,
                    arguments: finalized.arguments,
                    is_error: finalized.is_error,
                });
            }
        }

        if event.finish_reason.is_some() {
            captured.extend(pending.finalize_all(ToolCallBoundary::FinishReason).into_iter().map(
                |finalized| CapturedToolCall {
                    id: finalized.tool_id,
                    name: finalized.tool_name,
                    raw_arguments: finalized.raw_arguments,
                    arguments: finalized.arguments,
                    is_error: finalized.is_error,
                },
            ));
        }
    }

    captured.extend(pending.finalize_all(ToolCallBoundary::StreamEnd).into_iter().map(
        |finalized| CapturedToolCall {
            id: finalized.tool_id,
            name: finalized.tool_name,
            raw_arguments: finalized.raw_arguments,
            arguments: finalized.arguments,
            is_error: finalized.is_error,
        },
    ));
    captured
}

#[tokio::test]
async fn openai_fixture_harness_replays_split_tool_arguments_with_usage() -> Result<()> {
    let events =
        replay_openai_fixture("stream/openai/tool_args_split_with_usage.sse", false).await?;

    let tool_events: Vec<_> = events
        .iter()
        .filter_map(|event| event.tool_call.as_ref())
        .collect();
    assert_eq!(tool_events.len(), 2);
    assert_eq!(tool_events[0].id.as_deref(), Some("call_1"));
    assert_eq!(tool_events[0].name.as_deref(), Some("tool_a"));
    assert_eq!(tool_events[0].arguments.as_deref(), Some("{\"a\":"));
    assert_eq!(tool_events[1].arguments.as_deref(), Some("1}"));

    let usage = events
        .iter()
        .filter_map(|event| event.usage.as_ref())
        .last()
        .expect("fixture should emit usage");
    assert_eq!(usage.prompt_token_count, 1);
    assert_eq!(usage.candidates_token_count, 6);
    assert_eq!(usage.total_token_count, 7);
    assert!(events
        .iter()
        .any(|event| event.finish_reason.as_deref() == Some("tool_calls")));

    Ok(())
}

#[tokio::test]
async fn openai_ttft_timeout_waits_for_first_effective_stream_output_not_http_200() -> Result<()> {
    let payload = load_fixture_bytes("stream/openai/tool_args_split_with_usage.sse");
    let server = FixtureSseServer::spawn(
        payload,
        FixtureSseServerOptions {
            initial_delay: Duration::from_millis(60),
            ..Default::default()
        },
    )
    .await;
    let response = reqwest::get(server.url()).await?;
    let (tx_event, mut rx_event) = mpsc::unbounded_channel();

    handle_openai_stream(
        response,
        tx_event,
        None,
        false,
        Some(Duration::from_millis(20)),
        Some(Duration::from_secs(2)),
    )
    .await;

    let error = rx_event
        .recv()
        .await
        .expect("handler should emit TTFT error")
        .expect_err("delayed body should fail TTFT");
    assert!(
        error
            .to_string()
            .contains("TTFT timeout after 0s waiting for first effective output"),
        "unexpected error: {error}"
    );

    Ok(())
}

#[tokio::test]
async fn openai_fixture_accepts_tool_call_without_type_field() -> Result<()> {
    let events = replay_openai_fixture("stream/openai/tool_call_missing_type_field.sse", false)
        .await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_abc123");
    assert_eq!(tool_calls[0].name, "test_tool");
    assert_eq!(tool_calls[0].arguments, serde_json::json!({ "value": "hello" }));
    assert_eq!(tool_calls[0].raw_arguments, "{\"value\":\"hello\"}");
    assert!(!tool_calls[0].is_error);
    assert_eq!(
        events
            .iter()
            .filter_map(|event| event.usage.as_ref())
            .last()
            .map(|usage| usage.total_token_count),
        Some(15)
    );

    Ok(())
}

#[tokio::test]
async fn openai_fixture_reattaches_id_only_prelude_to_payload_chunk() -> Result<()> {
    let events =
        replay_openai_fixture("stream/openai/tool_id_prelude_then_payload_without_id.sse", false)
            .await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_1");
    assert_eq!(tool_calls[0].name, "tool_a");
    assert_eq!(
        tool_calls[0].arguments,
        serde_json::json!({ "city": "Beijing" })
    );
    assert!(!tool_calls[0].is_error);

    Ok(())
}

#[tokio::test]
async fn responses_fixture_keeps_malformed_tool_arguments_invalid() -> Result<()> {
    let events = replay_responses_fixture("stream/responses/malformed_function_call_arguments.sse")
        .await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "call_resp_bad_json");
    assert_eq!(tool_calls[0].name, "tool_a");
    assert_eq!(tool_calls[0].raw_arguments, "{\"a\":1}}");
    assert_eq!(tool_calls[0].arguments, serde_json::json!({}));
    assert!(tool_calls[0].is_error);

    Ok(())
}

#[tokio::test]
async fn anthropic_fixture_replays_extended_thinking_signature_and_text() -> Result<()> {
    let events = replay_anthropic_fixture("stream/anthropic/extended_thinking.sse").await?;

    let reasoning = events
        .iter()
        .filter_map(|event| event.reasoning_content.as_deref())
        .collect::<String>();
    let text = events
        .iter()
        .filter_map(|event| event.text.as_deref())
        .collect::<String>();
    let signature = events
        .iter()
        .filter_map(|event| event.thinking_signature.as_deref())
        .last();

    assert_eq!(reasoning, "Let me reason about this. Step by step.");
    assert_eq!(text, "Here is the answer.");
    assert_eq!(signature, Some("sig_abc123"));
    assert!(events
        .iter()
        .any(|event| event.finish_reason.as_deref() == Some("end_turn")));

    Ok(())
}

#[tokio::test]
async fn anthropic_fixture_routes_interleaved_parallel_tool_use() -> Result<()> {
    let events =
        replay_anthropic_fixture("stream/anthropic/interleaved_parallel_tool_use.sse").await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 2);
    assert_eq!(tool_calls[0].id, "toolu_parallel_0");
    assert_eq!(tool_calls[0].name, "tool_a");
    assert_eq!(tool_calls[0].arguments, serde_json::json!({ "a": 1 }));
    assert!(!tool_calls[0].is_error);
    assert_eq!(tool_calls[1].id, "toolu_parallel_1");
    assert_eq!(tool_calls[1].name, "tool_b");
    assert_eq!(tool_calls[1].arguments, serde_json::json!({ "b": 2 }));
    assert!(!tool_calls[1].is_error);

    Ok(())
}

#[tokio::test]
async fn anthropic_fixture_keeps_malformed_tool_arguments_invalid() -> Result<()> {
    let events =
        replay_anthropic_fixture("stream/anthropic/malformed_tool_arguments_extra_brace.sse")
            .await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].id, "toolu_bad_json");
    assert_eq!(tool_calls[0].name, "tool_a");
    assert_eq!(tool_calls[0].raw_arguments, "{\"a\":1}}");
    assert_eq!(tool_calls[0].arguments, serde_json::json!({}));
    assert!(tool_calls[0].is_error);

    Ok(())
}

#[tokio::test]
async fn gemini_fixture_preserves_string_function_arguments() -> Result<()> {
    let events = replay_gemini_fixture("stream/gemini/function_call_string_args.sse").await?;
    let tool_calls = captured_tool_calls(&events);

    assert_eq!(tool_calls.len(), 1);
    assert_eq!(tool_calls[0].name, "tool_a");
    assert_eq!(tool_calls[0].arguments, serde_json::json!("git status"));
    assert!(!tool_calls[0].is_error);

    Ok(())
}

#[tokio::test]
async fn openai_fixture_harness_replays_inline_think_text() -> Result<()> {
    let events = replay_openai_fixture("stream/openai/inline_think_text.sse", true).await?;

    let reasoning = events
        .iter()
        .filter_map(|event| event.reasoning_content.as_deref())
        .collect::<String>();
    let text = events
        .iter()
        .filter_map(|event| event.text.as_deref())
        .collect::<String>();

    assert_eq!(
        reasoning,
        "I should inspect the data. Then answer carefully."
    );
    assert_eq!(text, "Final answer.");
    assert!(events
        .iter()
        .any(|event| event.finish_reason.as_deref() == Some("stop")));

    Ok(())
}
