# Codex app-server watch plane

The orchestrator watch plane is an optional local Codex CLI control plane. It does not give Grok native `codex_app` tools, and `lfg setup` does not require or start Codex app-server.

## Capability matrix

| Surface | MVP support | Notes |
|---|---|---|
| `codex app-server daemon start` | Best-effort | Failure returns `availability: "missing"` plus recovery recipes. |
| `codex app-server proxy` | Implemented | Newline-delimited JSON request/response transport. |
| `initialize` | Implemented | Required handshake before queries. |
| `thread/list` | Implemented | Reads thread id, session id, cwd, name/preview, timestamps, and runtime status. |
| `thread/read` | Not used | The CEO monitor does not read full turns or message content. |
| `thread/status/changed` events | Protocol supports it; snapshot only in MVP | Re-run `lfg --json orchestrator watch` for a bounded refresh. |
| Attach an existing project thread | Implemented | `handoff plan` matches `--app-server-thread-id` first, otherwise the newest thread for the project cwd. |
| Start/resume a thread | Implemented | Starts a project thread when none exists; resumes an explicit id that is not in the list snapshot. |
| Start a turn | Implemented | Sends the generated coding handoff prompt with `turn/start`. |
| `codex exec` fallback | Implemented | Returned explicitly as `transport: "codex-exec-fallback"`; never reported as an app-server handoff. |
| Native Grok `codex_app` tools | Not available | This bridge shells out to the local `codex` CLI. |

For a GPT coding handoff, `lfg --json handoff plan --role coding --engine gpt` starts the daemon, attaches or creates the project thread, and starts the turn. If Codex app-server is unavailable, the JSON keeps `handoff.launch` as the executable `codex exec` fallback and identifies that transport honestly. Use `lfg --json orchestrator watch` to refresh live state and poll RESULT files.

RESULT files remain the fail-closed fallback for completion evidence.

The client filters `thread/list` by the current project directory and does not emit absolute private paths in this document.
