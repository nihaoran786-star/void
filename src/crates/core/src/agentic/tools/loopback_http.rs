//! HTTP client policy for tool-owned loopback endpoints.

use std::net::IpAddr;

/// Build a client for `target_url`, bypassing environment proxies only for
/// loopback IPs and names in the special-use `.localhost` domain.
pub(super) fn client_builder_for_url(target_url: &str) -> reqwest::ClientBuilder {
    let builder = reqwest::Client::builder();
    if should_bypass_proxy(target_url) {
        builder
            .no_proxy()
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() > 10 {
                    attempt.error("too many redirects")
                } else if !should_bypass_proxy(attempt.url().as_str()) {
                    attempt.error(
                        "loopback client refused redirect to non-loopback URL; rebuild the request with the system-proxy client",
                    )
                } else {
                    attempt.follow()
                }
            }))
    } else {
        builder
    }
}

pub(super) fn should_bypass_proxy(target_url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(target_url) else {
        return false;
    };
    let Some(host) = url.host_str() else {
        return false;
    };

    let normalized_host = host
        .strip_prefix('[')
        .and_then(|host| host.strip_suffix(']'))
        .unwrap_or(host)
        .to_ascii_lowercase();
    if normalized_host == "localhost" || normalized_host.ends_with(".localhost") {
        return true;
    }

    normalized_host
        .parse::<IpAddr>()
        .is_ok_and(|address| address.is_loopback())
}

#[cfg(test)]
mod tests {
    use super::{client_builder_for_url, should_bypass_proxy};
    use std::error::Error as _;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn bypasses_proxy_only_for_loopback_hosts() {
        for url in [
            "http://localhost:9222/json/version",
            "http://LOCALHOST:9222/json/version",
            "http://app.localhost:9222/json/version",
            "http://127.0.0.1:9222/json/version",
            "http://127.10.20.30:9222/json/version",
            "http://[::1]:9222/json/version",
        ] {
            assert!(
                should_bypass_proxy(url),
                "loopback URL should bypass proxies: {url}"
            );
        }

        for url in [
            "http://localhost.example.com/",
            "http://evil-localhost.com/",
            "http://192.168.1.1/",
            "https://example.com/",
            "not a valid URL",
        ] {
            assert!(
                !should_bypass_proxy(url),
                "non-loopback URL should keep system proxy behavior: {url}"
            );
        }
    }

    #[tokio::test]
    async fn loopback_client_rejects_redirect_to_non_loopback_before_connecting() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind redirect server");
        let address = listener.local_addr().expect("redirect server address");
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept request");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).await.expect("read request");
            stream
                .write_all(
                    b"HTTP/1.1 302 Found\r\nLocation: http://public.invalid/final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("write redirect response");
        });

        let url = format!("http://{address}/start");
        let client = client_builder_for_url(&url)
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .expect("build loopback client");
        let error = client
            .get(&url)
            .send()
            .await
            .expect_err("cross-boundary redirect must be rejected");

        assert!(error.is_redirect(), "expected redirect error, got: {error}");
        let mut diagnostic = error.to_string();
        let mut source = error.source();
        while let Some(cause) = source {
            diagnostic.push_str(": ");
            diagnostic.push_str(&cause.to_string());
            source = cause.source();
        }
        assert!(
            diagnostic.contains("loopback client refused redirect to non-loopback URL"),
            "redirect error chain should explain the proxy boundary: {diagnostic}"
        );
        server.await.expect("redirect server task");
    }

    #[tokio::test]
    async fn loopback_client_follows_loopback_redirect() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind redirect server");
        let address = listener.local_addr().expect("redirect server address");
        let server = tokio::spawn(async move {
            for request_index in 0..2 {
                let (mut stream, _) = listener.accept().await.expect("accept request");
                let mut request = [0_u8; 2048];
                let bytes = stream.read(&mut request).await.expect("read request");
                let request = String::from_utf8_lossy(&request[..bytes]);

                if request_index == 0 {
                    assert!(request.starts_with("GET /start "));
                    let response = format!(
                        "HTTP/1.1 302 Found\r\nLocation: http://{address}/final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    );
                    stream
                        .write_all(response.as_bytes())
                        .await
                        .expect("write redirect response");
                } else {
                    assert!(request.starts_with("GET /final "));
                    stream
                        .write_all(
                            b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                        )
                        .await
                        .expect("write final response");
                }
            }
        });

        let url = format!("http://{address}/start");
        let client = client_builder_for_url(&url)
            .timeout(std::time::Duration::from_secs(3))
            .build()
            .expect("build loopback client");
        let response = client.get(&url).send().await.expect("follow redirect");

        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert_eq!(response.text().await.expect("read response"), "ok");
        server.await.expect("redirect server task");
    }
}
