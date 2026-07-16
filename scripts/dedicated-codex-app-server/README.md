# Dedicated Codex app-server (senpi-backed)

Spike path: run a **dedicated** Codex-compatible app-server from the local
`senpi` coding-agent build, then point lfg at it with `LFG_CODEX_BINARY`.

## Start

```bash
export SENPI_CLI="$HOME/workspace/ulw/senpi/packages/coding-agent/dist/cli.js"
export DEDICATED_APP_SERVER_PORT=19890
export DEDICATED_APP_SERVER_HOME="${TMPDIR:-/tmp}/lfg-dedicated-app-server"
./scripts/dedicated-codex-app-server/codex-shim app-server daemon start
curl -sf "http://127.0.0.1:${DEDICATED_APP_SERVER_PORT}/readyz"
```

Listen: `ws://127.0.0.1:19890` with `--ws-auth off` (loopback). `/readyz` returns `ok`.

## Point lfg at it

```bash
export LFG_CODEX_BINARY="$PWD/scripts/dedicated-codex-app-server/codex-shim"
export LFG_CODEX_APP_SERVER_TIMEOUT_MS=45000
export LFG_CODEX_APP_SERVER_HOME="${DEDICATED_APP_SERVER_HOME}/codex-home"
lfg --json handoff plan --role coding --engine gpt --focus "..."
```

The shim intentionally fails `app-server proxy` fast so lfg falls through to
`app-server --stdio` (or uses the already-running daemon for health). Optional
Codex methods like `thread/goal/set` are soft-failed by lfg when the host returns
`-32601 Method not found` (senpi).

## Grok worktree swap

```bash
# after cargo build -p xai-grok-pager-bin --release in ~/workspace/linalab/lina-build
./scripts/dedicated-codex-app-server/grok-swap.sh swap \
  "$HOME/workspace/linalab/lina-build/target/release/xai-grok-pager"
./scripts/dedicated-codex-app-server/grok-swap.sh status
./scripts/dedicated-codex-app-server/grok-swap.sh restore
```
