# AgenC-core → lfg orchestrator monitor (reference map)

Source: https://github.com/tetsuo-ai/agenc-core (public, runtime 0.6.x)

## AgenC patterns we copy (not clone the whole product)

| AgenC | Meaning | lfg owner |
| --- | --- | --- |
| Daemon `app-server` owns agent lifecycle | Work lives outside the chat UI; UI attaches | Codex **app-server** + `.omo/orchestrator/inbox.json` |
| `agent start\|list\|attach\|stop\|logs` | Background jobs are first-class | `lfg --json orchestrator thread/status/poll/watch` |
| **Heartbeat** (`runtime/src/heartbeat/`) | Periodic proactive tick; reads checklist; `HEARTBEAT_OK` if idle | Hook-driven **monitor board**: SessionStart / UserPromptSubmit / Stop always run real status+poll+watch and inject **live** board |
| Gateway client of daemon | No silent detach | Grok CEO never “assumes done”; board shows running/ready/failed |
| Budget / no idle-burn | Heartbeat does not fake work | `HEARTBEAT_OK` when no open asks/running threads — short, no re-handoff |
| MonitorTool (background shell stream) | Long jobs watched without blocking | RESULT path poll + app-server snapshot (already in `orchestrator watch`) |

## What was wrong in lfg (lazy)

1. Hooks only injected **text** (“MUST run status/poll”) — model often skipped → **no monitoring**.
2. Low-nudge policy without a **machine-built board** = passive silence after handoff.
3. Auto-handoff used bare `lfg` → launch_failed; installed hook **drift** from source.
4. SessionStart **45s MCP wait** + empty board = stalls then nothing useful.
5. Account rotate on SessionStart clobbered auth (separate fix).

## Required lfg behavior (must ship)

### Monitor board (always-on, hook-built)

On **SessionStart, UserPromptSubmit, Stop** (`lfg-native-orchestrator-inbox.mjs`):

1. Resolve lfg CLI robustly (`LFG_BIN` / `~/.grok/bin/lfg` / `node dist/lfg.js`).
2. Run (bounded, fail-soft):
   - `lfg --json orchestrator poll`
   - `lfg --json orchestrator watch` (startDaemon true only on SessionStart; false or short timeout on UserPromptSubmit)
3. Write `.omo/orchestrator/monitor-board.json` + embed markdown board in `additionalContext`:
   ```
   <lfg-monitor-board source="hook" force="true">
   unanswered=N running=N ready=N failed=N app_server=available|missing
   ASK … / THR … / RESULT …
   duty: if ready → answer; if running → wait (no re-handoff); if none → HEARTBEAT_OK
   </lfg-monitor-board>
   ```
4. MCP ready default timeout **3s** (env override). Never 45s stall.
5. When `running>0` or `ready>0`: statusMessage must show counts (not soft CEO fluff).

### Auto goal (UserPromptSubmit work)

`lfg-native-codex-assign.mjs`:

1. Same binary resolver.
2. Non-trivial work → `lfg --json plan goal --focus …` first (Codex App goal sync); fallback handoff plan.
3. Inject `<lfg-auto-goal>` with thread id; ALREADY EXECUTED → no re-launch.
4. Receipt under `.omo/orchestrator/`.

### Account rotate

UserPromptSubmit only; never SessionStart clobber.

## Non-goals

- Porting AgenC TUI / gateway / Telegram.
- Full heartbeat process outside Grok hooks (unless later `lfg orchestrator heartbeat` daemon).
- Replacing Codex app-server with AgenC daemon.

## Verify

```
npx vitest run src/grok/hooks src/core/lfg/orchestrator src/cli/command/orchestrator-command.test.ts src/cli/command/goal-command.test.ts
```
