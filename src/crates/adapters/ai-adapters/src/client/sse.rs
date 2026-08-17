use crate::client::utils::elapsed_ms_u64;
use crate::client::StreamResponse;
use crate::stream::UnifiedResponse;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use futures::Stream;
use log::{debug, error, warn};
use reqwest::{
    header::{HeaderMap, RETRY_AFTER},
    StatusCode, Version,
};
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

const BASE_RETRY_DELAY_MS: u64 = 500;
/// Maximum delay applied to a `Retry-After` header value.
///
/// Some providers return large values for TPM or capacity windows. Capping at
/// 60s respects provider guidance without creating unbounded user-visible stalls.
const MAX_RETRY_AFTER_DELAY_MS: u64 = 60_000;

enum StreamSendOutcome {
    Response(reqwest::Response),
    Transport(reqwest::Error),
    TtftTimeout,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StreamHttpMode {
    Auto,
    Http1Fallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StreamHttpState {
    Http2Available,
    Http2UnavailableUsingHttp1,
    Http2NegotiationOrConnectionFailed,
    Http1FallbackConnected,
    ConnectionInterrupted,
    Failed,
}

fn request_for_http_mode(
    request: reqwest::RequestBuilder,
    mode: StreamHttpMode,
) -> reqwest::RequestBuilder {
    match mode {
        StreamHttpMode::Auto => request,
        StreamHttpMode::Http1Fallback => request.version(Version::HTTP_11),
    }
}

fn connected_http_state(mode: StreamHttpMode, version: Version) -> StreamHttpState {
    match (mode, version) {
        (_, Version::HTTP_2) => StreamHttpState::Http2Available,
        (StreamHttpMode::Auto, _) => StreamHttpState::Http2UnavailableUsingHttp1,
        (StreamHttpMode::Http1Fallback, _) => StreamHttpState::Http1FallbackConnected,
    }
}

fn failed_http_state(mode: StreamHttpMode, has_more_attempts: bool) -> StreamHttpState {
    match (mode, has_more_attempts) {
        (StreamHttpMode::Auto, true) => StreamHttpState::Http2NegotiationOrConnectionFailed,
        (StreamHttpMode::Http1Fallback, true) => StreamHttpState::ConnectionInterrupted,
        (_, false) => StreamHttpState::Failed,
    }
}

struct AbortHandlerOnDropStream {
    inner: tokio_stream::wrappers::UnboundedReceiverStream<Result<UnifiedResponse>>,
    handler_task: JoinHandle<()>,
}

impl Stream for AbortHandlerOnDropStream {
    type Item = Result<UnifiedResponse>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Pin::new(&mut self.inner).poll_next(cx)
    }
}

impl Drop for AbortHandlerOnDropStream {
    fn drop(&mut self) {
        if !self.handler_task.is_finished() {
            self.handler_task.abort();
        }
    }
}

fn stream_with_handler_abort_on_drop(
    rx: mpsc::UnboundedReceiver<Result<UnifiedResponse>>,
    handler_task: JoinHandle<()>,
) -> Pin<Box<dyn Stream<Item = Result<UnifiedResponse>> + Send>> {
    Box::pin(AbortHandlerOnDropStream {
        inner: tokio_stream::wrappers::UnboundedReceiverStream::new(rx),
        handler_task,
    })
}

async fn send_stream_request<BuildRequest>(
    build_request: BuildRequest,
    request_body: &serde_json::Value,
    ttft_timeout: Option<Duration>,
    http_mode: StreamHttpMode,
) -> StreamSendOutcome
where
    BuildRequest: Fn() -> reqwest::RequestBuilder,
{
    let build = || request_for_http_mode(build_request(), http_mode).json(request_body);
    match ttft_timeout {
        Some(timeout) => match tokio::time::timeout(timeout, build().send()).await {
            Ok(Ok(response)) => StreamSendOutcome::Response(response),
            Ok(Err(error)) => StreamSendOutcome::Transport(error),
            Err(_) => StreamSendOutcome::TtftTimeout,
        },
        None => match build().send().await {
            Ok(response) => StreamSendOutcome::Response(response),
            Err(error) => StreamSendOutcome::Transport(error),
        },
    }
}

fn format_ttft_timeout_error(label: &str, ttft_timeout: Option<Duration>) -> String {
    let timeout_secs = ttft_timeout.map(|timeout| timeout.as_secs()).unwrap_or(0);
    format!(
        "{} TTFT timeout after {}s waiting for response headers",
        label, timeout_secs
    )
}

fn format_transport_error(label: &str, error: &reqwest::Error) -> String {
    let mut message = format!("{} connection failed: {}", label, error);
    let mut source = std::error::Error::source(error);
    let mut index = 1;

    while let Some(cause) = source {
        message.push_str(&format!("; cause {}: {}", index, cause));
        source = cause.source();
        index += 1;
    }

    message
}

fn remaining_ttft_timeout(
    started_at: std::time::Instant,
    ttft_timeout: Option<Duration>,
) -> Option<Duration> {
    ttft_timeout.map(|timeout| timeout.saturating_sub(started_at.elapsed()))
}

fn is_retryable_http_status(status: StatusCode) -> bool {
    status.is_server_error() || matches!(status.as_u16(), 408 | 409 | 425 | 429)
}

fn exponential_retry_delay_ms(attempt: usize) -> u64 {
    BASE_RETRY_DELAY_MS * (1 << attempt.min(3))
}

fn retry_after_delay_ms(headers: &HeaderMap) -> Option<u64> {
    let value = headers.get(RETRY_AFTER)?.to_str().ok()?.trim();

    if let Ok(seconds) = value.parse::<u64>() {
        return Some(seconds.saturating_mul(1000).min(MAX_RETRY_AFTER_DELAY_MS));
    }

    let retry_at = DateTime::parse_from_rfc2822(value)
        .ok()?
        .with_timezone(&Utc);
    let now = Utc::now();
    if retry_at <= now {
        return Some(0);
    }

    Some(
        retry_at
            .signed_duration_since(now)
            .num_milliseconds()
            .max(0) as u64,
    )
    .map(|delay| delay.min(MAX_RETRY_AFTER_DELAY_MS))
}

fn retry_delay_ms(attempt: usize, headers: &HeaderMap) -> u64 {
    retry_after_delay_ms(headers).unwrap_or_else(|| exponential_retry_delay_ms(attempt))
}

pub(crate) async fn execute_sse_request<BuildRequest, SpawnHandler>(
    label: &str,
    _url: &str,
    request_body: &serde_json::Value,
    max_tries: usize,
    ttft_timeout: Option<Duration>,
    build_request: BuildRequest,
    spawn_handler: SpawnHandler,
) -> Result<StreamResponse>
where
    BuildRequest: Fn() -> reqwest::RequestBuilder,
    SpawnHandler: Fn(
        reqwest::Response,
        mpsc::UnboundedSender<Result<UnifiedResponse>>,
        Option<mpsc::UnboundedSender<String>>,
        Option<Duration>,
    ) -> JoinHandle<()>,
{
    let mut last_error = None;
    let mut http_mode = StreamHttpMode::Auto;
    for attempt in 0..max_tries {
        let request_start_time = std::time::Instant::now();
        let send_outcome =
            send_stream_request(&build_request, request_body, ttft_timeout, http_mode).await;

        let response = match send_outcome {
            StreamSendOutcome::Response(resp) => {
                let connect_time = elapsed_ms_u64(request_start_time);
                let status = resp.status();
                let headers = resp.headers().clone();

                if status.is_client_error() && !is_retryable_http_status(status) {
                    let error_text = resp
                        .text()
                        .await
                        .unwrap_or_else(|e| format!("Failed to read error response: {}", e));
                    error!("{} client error {}: {}", label, status, error_text);
                    return Err(anyhow!("{} client error {}: {}", label, status, error_text));
                }

                if status.is_success() {
                    let transport_state = connected_http_state(http_mode, resp.version());
                    debug!(
                        "{} request connected: {}ms, status: {}, http_state: {:?}, version: {:?}, attempt: {}/{}",
                        label,
                        connect_time,
                        status,
                        transport_state,
                        resp.version(),
                        attempt + 1,
                        max_tries
                    );
                    resp
                } else {
                    let error_text = resp
                        .text()
                        .await
                        .unwrap_or_else(|e| format!("Failed to read error response: {}", e));
                    let error = anyhow!("{} error {}: {}", label, status, error_text);
                    warn!(
                        "{} request failed: {}ms, attempt {}/{}, error: {}",
                        label,
                        connect_time,
                        attempt + 1,
                        max_tries,
                        error
                    );
                    last_error = Some(error);

                    if attempt < max_tries - 1 {
                        let delay_ms = retry_delay_ms(attempt, &headers);
                        debug!(
                            "Retrying {} after {}ms (attempt {}, status {})",
                            label,
                            delay_ms,
                            attempt + 2,
                            status
                        );
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    }
                    continue;
                }
            }
            StreamSendOutcome::Transport(e) => {
                let connect_time = request_start_time.elapsed().as_millis();
                let has_more_attempts = attempt < max_tries - 1;
                let transport_state = failed_http_state(http_mode, has_more_attempts);
                let error_msg = format_transport_error(label, &e);
                let error = anyhow!("{}", error_msg);
                warn!(
                    "{} request failed: {}ms, http_state: {:?}, attempt {}/{}, error: {}",
                    label,
                    connect_time,
                    transport_state,
                    attempt + 1,
                    max_tries,
                    error_msg
                );
                last_error = Some(error);

                if has_more_attempts {
                    if http_mode == StreamHttpMode::Auto {
                        http_mode = StreamHttpMode::Http1Fallback;
                    }
                    let delay_ms = exponential_retry_delay_ms(attempt);
                    debug!(
                        "Retrying {} after {}ms with {:?} (attempt {})",
                        label,
                        delay_ms,
                        http_mode,
                        attempt + 2
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
                continue;
            }
            StreamSendOutcome::TtftTimeout => {
                let connect_time = request_start_time.elapsed().as_millis();
                let has_more_attempts = attempt < max_tries - 1;
                let transport_state = failed_http_state(http_mode, has_more_attempts);
                let error_msg = format_ttft_timeout_error(label, ttft_timeout);
                let error = anyhow!("{}", error_msg);
                warn!(
                    "{} request failed: {}ms, http_state: {:?}, attempt {}/{}, error: {}",
                    label,
                    connect_time,
                    transport_state,
                    attempt + 1,
                    max_tries,
                    error_msg
                );
                last_error = Some(error);

                if has_more_attempts {
                    if http_mode == StreamHttpMode::Auto {
                        http_mode = StreamHttpMode::Http1Fallback;
                    }
                    let delay_ms = exponential_retry_delay_ms(attempt);
                    debug!(
                        "Retrying {} after {}ms with {:?} (attempt {})",
                        label,
                        delay_ms,
                        http_mode,
                        attempt + 2
                    );
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
                continue;
            }
        };

        let (tx, rx) = mpsc::unbounded_channel();
        let (tx_raw, rx_raw) = mpsc::unbounded_channel();
        let remaining_ttft_timeout = remaining_ttft_timeout(request_start_time, ttft_timeout);
        let handler_task = spawn_handler(response, tx, Some(tx_raw), remaining_ttft_timeout);

        return Ok(StreamResponse {
            stream: stream_with_handler_abort_on_drop(rx, handler_task),
            raw_sse_rx: Some(rx_raw),
        });
    }

    let error_msg = format!(
        "{} failed after {} attempts: {}",
        label,
        max_tries,
        last_error.unwrap_or_else(|| anyhow!("Unknown error"))
    );
    error!("{}", error_msg);
    Err(anyhow!(error_msg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::{FutureExt, StreamExt};
    use reqwest::header::HeaderValue;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;

    #[test]
    fn http_transport_states_cover_http2_negotiation_and_http1_fallback() {
        assert_eq!(
            connected_http_state(StreamHttpMode::Auto, Version::HTTP_2),
            StreamHttpState::Http2Available
        );
        assert_eq!(
            connected_http_state(StreamHttpMode::Auto, Version::HTTP_11),
            StreamHttpState::Http2UnavailableUsingHttp1
        );
        assert_eq!(
            connected_http_state(StreamHttpMode::Http1Fallback, Version::HTTP_11),
            StreamHttpState::Http1FallbackConnected
        );
    }

    #[test]
    fn transport_failure_downgrades_once_then_reports_interruption_or_failure() {
        assert_eq!(
            failed_http_state(StreamHttpMode::Auto, true),
            StreamHttpState::Http2NegotiationOrConnectionFailed
        );
        assert_eq!(
            failed_http_state(StreamHttpMode::Http1Fallback, true),
            StreamHttpState::ConnectionInterrupted
        );
        assert_eq!(
            failed_http_state(StreamHttpMode::Http1Fallback, false),
            StreamHttpState::Failed
        );
    }

    #[test]
    fn http1_fallback_sets_an_explicit_request_version() {
        let request = request_for_http_mode(
            reqwest::Client::new().get("https://example.com"),
            StreamHttpMode::Http1Fallback,
        )
        .build()
        .expect("request should build");

        assert_eq!(request.version(), Version::HTTP_11);
    }

    #[tokio::test]
    async fn transport_disconnect_retries_with_http1_fallback() {
        let closed_listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("reserve a closed port");
        let closed_url = format!("http://{}", closed_listener.local_addr().unwrap());
        drop(closed_listener);

        let fallback_listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fallback server");
        let fallback_url = format!("http://{}", fallback_listener.local_addr().unwrap());
        let (request_line_tx, request_line_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut socket, _) = fallback_listener.accept().await.expect("accept fallback");
            let mut buffer = vec![0_u8; 4096];
            let read = socket
                .read(&mut buffer)
                .await
                .expect("read fallback request");
            let request = String::from_utf8_lossy(&buffer[..read]);
            let request_line = request.lines().next().unwrap_or_default().to_string();
            let _ = request_line_tx.send(request_line);
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("write fallback response");
        });

        let attempts = Arc::new(AtomicUsize::new(0));
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .expect("test client");
        let build_attempts = attempts.clone();
        let response = execute_sse_request(
            "test stream",
            "",
            &serde_json::json!({ "stream": true }),
            2,
            None,
            move || {
                let attempt = build_attempts.fetch_add(1, Ordering::SeqCst);
                client.post(if attempt == 0 {
                    &closed_url
                } else {
                    &fallback_url
                })
            },
            |_, tx, _, _| tokio::spawn(async move { drop(tx) }),
        )
        .await
        .expect("HTTP/1.1 fallback should reconnect");

        drop(response);
        server.await.expect("fallback server task");
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert!(request_line_rx
            .await
            .expect("fallback request line")
            .ends_with("HTTP/1.1"));
    }

    #[test]
    fn format_ttft_timeout_error_includes_timeout_seconds() {
        let message = format_ttft_timeout_error(
            "Codex ChatGPT Responses API",
            Some(std::time::Duration::from_secs(30)),
        );

        assert!(message.contains("TTFT timeout after 30s"));
    }

    #[test]
    fn retryable_http_statuses_include_rate_limit_and_server_errors() {
        assert!(is_retryable_http_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_http_status(StatusCode::REQUEST_TIMEOUT));
        assert!(is_retryable_http_status(StatusCode::INTERNAL_SERVER_ERROR));
        assert!(is_retryable_http_status(StatusCode::BAD_GATEWAY));

        assert!(!is_retryable_http_status(StatusCode::UNAUTHORIZED));
        assert!(!is_retryable_http_status(StatusCode::BAD_REQUEST));
        assert!(!is_retryable_http_status(StatusCode::NOT_FOUND));
    }

    #[test]
    fn retry_after_seconds_is_capped() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static("120"));

        assert_eq!(
            retry_after_delay_ms(&headers),
            Some(MAX_RETRY_AFTER_DELAY_MS)
        );
    }

    #[test]
    fn remaining_ttft_timeout_subtracts_elapsed_request_time() {
        let start = std::time::Instant::now() - Duration::from_secs(2);
        let remaining = remaining_ttft_timeout(start, Some(Duration::from_secs(5)));

        let remaining = remaining.expect("remaining timeout");
        assert!(remaining <= Duration::from_secs(3));
        assert!(remaining > Duration::from_secs(2));
    }

    #[test]
    fn retry_after_preserves_sub_cap_values() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static("45"));

        assert_eq!(retry_after_delay_ms(&headers), Some(45_000));
    }

    #[test]
    fn retry_after_http_date_in_the_past_retries_immediately() {
        let mut headers = HeaderMap::new();
        headers.insert(
            RETRY_AFTER,
            HeaderValue::from_static("Wed, 21 Oct 2015 07:28:00 GMT"),
        );

        assert_eq!(retry_after_delay_ms(&headers), Some(0));
    }

    #[test]
    fn invalid_retry_after_header_uses_exponential_backoff() {
        let mut headers = HeaderMap::new();
        headers.insert(RETRY_AFTER, HeaderValue::from_static("not-a-date"));

        assert_eq!(retry_delay_ms(2, &headers), 2000);
    }

    #[test]
    fn retry_delay_falls_back_to_exponential_backoff() {
        let headers = HeaderMap::new();

        assert_eq!(retry_delay_ms(0, &headers), 500);
        assert_eq!(retry_delay_ms(1, &headers), 1000);
        assert_eq!(retry_delay_ms(4, &headers), 4000);
    }

    #[tokio::test]
    async fn dropping_returned_stream_aborts_handler_task() {
        let (tx, rx) = mpsc::unbounded_channel::<Result<UnifiedResponse>>();
        let (started_tx, started_rx) = oneshot::channel();
        let (dropped_tx, dropped_rx) = oneshot::channel();
        let handler_task = tokio::spawn(async move {
            let _keep_sender_alive = tx;
            let _ = started_tx.send(());
            struct AbortDropNotify(Option<oneshot::Sender<()>>);
            impl Drop for AbortDropNotify {
                fn drop(&mut self) {
                    if let Some(sender) = self.0.take() {
                        let _ = sender.send(());
                    }
                }
            }
            let _notify = AbortDropNotify(Some(dropped_tx));
            std::future::pending::<()>().await;
        });

        started_rx.await.expect("handler task started");
        let mut stream = stream_with_handler_abort_on_drop(rx, handler_task);
        drop(stream.next().now_or_never());
        drop(stream);

        tokio::time::timeout(Duration::from_secs(1), dropped_rx)
            .await
            .expect("handler task should be aborted when stream is dropped")
            .expect("drop notification should send");
    }
}
