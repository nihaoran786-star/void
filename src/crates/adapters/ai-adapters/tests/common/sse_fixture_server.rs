use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

#[derive(Debug, Clone, Copy)]
pub struct FixtureSseServerOptions {
    pub chunk_size: usize,
    pub chunk_delay: Duration,
    pub initial_delay: Duration,
}

impl Default for FixtureSseServerOptions {
    fn default() -> Self {
        Self {
            chunk_size: 23,
            chunk_delay: Duration::from_millis(1),
            initial_delay: Duration::ZERO,
        }
    }
}

pub struct FixtureSseServer {
    url: String,
    server_task: JoinHandle<()>,
}

impl FixtureSseServer {
    pub async fn spawn(payload: Vec<u8>, options: FixtureSseServerOptions) -> Self {
        let payload = Arc::new(payload);
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fixture SSE server");
        let addr = listener.local_addr().expect("fixture SSE server addr");
        let server_task = tokio::spawn(async move {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };

            let mut request_buffer = [0_u8; 1024];
            let _ = socket.read(&mut request_buffer).await;
            let header = concat!(
                "HTTP/1.1 200 OK\r\n",
                "content-type: text/event-stream\r\n",
                "cache-control: no-cache\r\n",
                "connection: close\r\n",
                "\r\n"
            );
            if socket.write_all(header.as_bytes()).await.is_err() {
                return;
            }

            if !options.initial_delay.is_zero() {
                tokio::time::sleep(options.initial_delay).await;
            }

            let chunk_size = options.chunk_size.max(1);
            for chunk in payload.chunks(chunk_size) {
                if socket.write_all(chunk).await.is_err() {
                    return;
                }
                if socket.flush().await.is_err() {
                    return;
                }
                if !options.chunk_delay.is_zero() {
                    tokio::time::sleep(options.chunk_delay).await;
                }
            }
        });

        Self {
            url: format!("http://{addr}/stream"),
            server_task,
        }
    }

    pub fn url(&self) -> &str {
        &self.url
    }
}

impl Drop for FixtureSseServer {
    fn drop(&mut self) {
        self.server_task.abort();
    }
}
