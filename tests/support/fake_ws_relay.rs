use std::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener as TokioTcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

pub struct FakeWsRelay {
    pub addr: std::net::SocketAddr,
    _shutdown_tx: oneshot::Sender<()>,
    _handle: JoinHandle<()>,
}

impl FakeWsRelay {
    pub fn ws_url(&self) -> String {
        format!("ws://{}", self.addr)
    }
}

pub async fn start_fake_ws_relay() -> FakeWsRelay {
    let std_listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = std_listener.local_addr().unwrap();
    drop(std_listener);

    let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
    let listener = TokioTcpListener::bind(addr).await.unwrap();
    let actual_addr = listener.local_addr().unwrap();

    let handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                _ = &mut shutdown_rx => break,
                result = listener.accept() => {
                    if let Ok((mut stream, _)) = result {
                        tokio::spawn(async move {
                            handle_ws_connection(&mut stream).await;
                        });
                    }
                }
            }
        }
    });

    FakeWsRelay {
        addr: actual_addr,
        _shutdown_tx: shutdown_tx,
        _handle: handle,
    }
}

async fn handle_ws_connection(stream: &mut tokio::net::TcpStream) {
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await.unwrap_or(0);
    if n == 0 {
        return;
    }

    let request = String::from_utf8_lossy(&buf[..n]);
    let key = extract_ws_key(&request).unwrap_or_default();
    let accept = compute_ws_accept(&key);

    let response = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {}\r\n\r\n",
        accept
    );
    let _ = stream.write_all(response.as_bytes()).await;

    loop {
        let mut frame_buf = vec![0u8; 4096];
        let n = match stream.read(&mut frame_buf).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };

        if n < 2 {
            break;
        }

        let opcode = frame_buf[0] & 0x0F;
        if opcode == 8 {
            break;
        }

        let masked = (frame_buf[1] & 0x80) != 0;
        let payload_len = (frame_buf[1] & 0x7F) as usize;

        if payload_len + if masked { 6 } else { 2 } > n {
            break;
        }

        let (mask_start, data_start) = if masked { (2, 6) } else { (2, 2) };
        let mask = if masked {
            [
                frame_buf[mask_start],
                frame_buf[mask_start + 1],
                frame_buf[mask_start + 2],
                frame_buf[mask_start + 3],
            ]
        } else {
            [0u8; 4]
        };

        let mut payload = vec![0u8; payload_len];
        for i in 0..payload_len {
            payload[i] = frame_buf[data_start + i] ^ if masked { mask[i % 4] } else { 0 };
        }

        let mut echo_frame = vec![0x81u8, payload_len as u8];
        echo_frame.extend_from_slice(&payload);
        let _ = stream.write_all(&echo_frame).await;
    }
}

fn extract_ws_key(request: &str) -> Option<String> {
    for line in request.lines() {
        if line.to_lowercase().starts_with("sec-websocket-key:") {
            return Some(line[18..].trim().to_string());
        }
    }
    None
}

fn compute_ws_accept(key: &str) -> String {
    let magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    let combined = format!("{}{}", key, magic);
    let hash = sha1(combined.as_bytes());
    base64_encode(&hash)
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let bit_len = (data.len() as u64) * 8;

    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999u32),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(w[i]);
            e = d; d = c; c = b.rotate_left(30); b = a; a = temp;
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut result = [0u8; 20];
    for (i, &val) in h.iter().enumerate() {
        result[i * 4..i * 4 + 4].copy_from_slice(&val.to_be_bytes());
    }
    result
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i] as u32;
        let b1 = if i + 1 < data.len() { data[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < data.len() { data[i + 2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        if i + 1 < data.len() {
            out.push(CHARS[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if i + 2 < data.len() {
            out.push(CHARS[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
        i += 3;
    }
    out
}
