# src/AGENTS.md

## OVERVIEW
Rust core for the `lfg` headless CLI/library. This layer owns CLI parsing, mock-model dispatch, credential/session storage, MCP stdio client behavior, and relay abstractions.

## WHERE TO LOOK
- `main.rs`: Clap CLI, `mcp`, `session`, `trace`, and `share` subcommands.
- `lib.rs`: Public module surface.
- `runtime/dispatch.rs`: `run_single`, `DispatchConfig`, mock-only headless execution.
- `runtime/output.rs`: Plain, JSON, and streaming JSON output contracts.
- `session/store.rs`: Session schema version 1 and JSON persistence.
- `session/trace.rs`: Trace export with credential redaction.
- `auth/store.rs`: `~/.config/lfg/auth.json`, lock file, Unix 0700/0600 permissions.
- `auth/credential.rs`: Credential precedence, runtime override, stored API key, stored OAuth, env var.
- `auth/provider.rs`, `auth/pkce.rs`, `auth/device.rs`, `auth/refresh.rs`: OAuth flows and token mapping.
- `models/client.rs`: HTTP model client error taxonomy.
- `mcp/stdio.rs`: Stdio JSON-RPC client with child stderr discarded.
- `agent/relay.rs`: In-memory mock relay and relay trait.

## CONVENTIONS
- `run_single` currently rejects non-`mock:` models. Preserve that headless safety unless the model/auth path is intentionally implemented.
- Session and auth tests use temp homes. Do not write to the developer's real `~/.config/lfg` in tests.
- Auth file writes are lock-protected and atomic. Keep permission assertions in sync with `tests/auth_store_tests.rs`.
- `McpStdioClient` suppresses child stderr so stdout stays parseable JSON-RPC.
- Redaction is part of session trace behavior. Update tests when adding credential patterns.

## ANTI-PATTERNS
- Do not introduce real network/provider calls into default `run_single` tests.
- Do not change stored JSON shapes without updating integration tests and docs.
- Do not print diagnostics from MCP flows where callers expect machine-readable JSON.
- Do not hide failing model errors behind fallback responses.

## COMMANDS
```sh
cargo test
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
```

## NOTES
- Rust integration coverage lives in top-level `tests/*.rs`.
- Fake HTTP/MCP/WS support lives under `tests/support/`.
