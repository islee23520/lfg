mod support;

use support::fake_ws_relay::start_fake_ws_relay;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[tokio::test]
async fn fake_ws_relay_localhost_only() {
    let relay = start_fake_ws_relay().await;
    let addr = relay.addr;
    println!("fake_ws_relay_localhost_only: addr={}", addr);
    assert_eq!(addr.ip().to_string(), "127.0.0.1");
}

#[tokio::test]
async fn fake_ws_relay_ws_url_format() {
    let relay = start_fake_ws_relay().await;
    let url = relay.ws_url();
    println!("fake_ws_relay_ws_url_format: url={}", url);
    assert!(url.starts_with("ws://127.0.0.1:"));
}

#[tokio::test]
async fn fake_ws_relay_handshake() {
    let relay = start_fake_ws_relay().await;
    let mut stream = TcpStream::connect(relay.addr).await.unwrap();

    let handshake = "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    stream.write_all(handshake.as_bytes()).await.unwrap();

    let mut buf = vec![0u8; 512];
    let n = stream.read(&mut buf).await.unwrap();
    let response = String::from_utf8_lossy(&buf[..n]);
    println!("fake_ws_relay_handshake: got 101 response");
    assert!(response.contains("101 Switching Protocols"));
    assert!(response.contains("Sec-WebSocket-Accept:"));
}

#[tokio::test]
async fn fake_ws_relay_echo() {
    let relay = start_fake_ws_relay().await;
    let mut stream = TcpStream::connect(relay.addr).await.unwrap();

    let handshake = "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    stream.write_all(handshake.as_bytes()).await.unwrap();

    let mut buf = vec![0u8; 512];
    stream.read(&mut buf).await.unwrap();

    let payload = b"ping";
    let mask = [0x37, 0xfa, 0x21, 0x3d];
    let mut frame = vec![0x81u8, 0x84];
    frame.extend_from_slice(&mask);
    for (i, &b) in payload.iter().enumerate() {
        frame.push(b ^ mask[i % 4]);
    }
    stream.write_all(&frame).await.unwrap();

    let mut echo_buf = vec![0u8; 64];
    let n = stream.read(&mut echo_buf).await.unwrap();
    let echoed = &echo_buf[2..n];
    println!("fake_ws_relay_echo: echoed payload matches original");
    assert_eq!(echoed, payload);
}
