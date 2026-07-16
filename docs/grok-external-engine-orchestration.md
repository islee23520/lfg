# Grok → Codex App-Server Orchestration

**Status:** GPT-only external implementation contract (2026-07-15)

**Model:** Grok stays the Sisyphus watcher and prepares complete work for the project Codex app-server thread.

## Required startup contract

Codex CLI is the sole required external-work prerequisite. `lfg setup --run` fails closed before changing the Grok installation when `codex` is not executable on `PATH`. LazyCodex is a bundled, read-only handoff facade; it must never probe, install, set up, or run Codex or `lazycodex-ai`.

Every SessionStart injects `<lfg-codex-startup force="true">`. Product work must use `lfg --json handoff plan --role coding --engine gpt --focus "…"` and then launch the returned Codex argv. No in-host Grok or LazyCodex implementer is allowed.

## Run model

| OMO idea | lfg realization |
| --- | --- |
| Sisyphus orchestrator | **Grok** (intent gateway, monitoring, approval, Boulder, ledger, `/goal`) |
| Intent / ambiguity gateway | **gjc** (short classification and refined focus only) |
| Decision-complete plan body | **Codex** with skill `$ulw-plan` |
| Every product worker role | **Codex app-server** as engine `gpt` |
| Daemon unavailable | Reported **`codex-exec-fallback`** launch only |

```text
Grok CEO receives the request
  -> UserPromptSubmit calls gjc for intent / ambiguity classification
  -> optional gjc deep-interview only when ambiguity is high / interview is needed
  -> lfg --json plan ulw-plan
  -> Codex loads $ulw-plan and writes the decision-complete plan under .omo/
  -> Grok presents the plan and waits for user approval
  -> lfg --json handoff plan --role coding --engine gpt
  -> lfg creates or attaches the project Codex app-server thread
  -> only if the daemon is unavailable, caller uses codex-exec-fallback
  -> worker writes the requested RESULT block
  -> Grok updates its ledger and continues
```

The Codex thread is the sole executor for that product body. Grok may monitor, explore, or inspect git history, but it must not spawn an in-host coding/hephaestus/lazycodex-worker implementer. gjc is optional at runtime and fail-open when missing or timed out; it is never a product implementation engine. agy remains optional for vision confirmation.

## Public command

The only public surface is JSON-only:

```sh
lfg --json handoff plan \
  --role coding \
  --engine gpt \
  --focus "Add bounded retry" \
  --scope src/retry.ts \
  --accept "Tests cover exhaustion" \
  --verify "npm test" \
  --no-probe
```

Start-work has a dedicated non-mutating launch planner:

```sh
lfg --json plan start-work --plan .omo/plans/release.md --focus "Ship the release"
```

This returns `dryRun: true`, `executed: false`, and a Codex launch whose worker brief invokes `$start-work`. It never executes the plan inside Grok and never submits an app-server turn. Its machine contract reports `transport.primary: "app-server"` and `transport.fallback: "codex-exec"`: create or attach the app-server thread first, and execute `handoff.launch.argv` only when the daemon is unavailable. The Codex skill writes its completion receipt to `the Codex App thread (optional receipt only if --result-path is set)`; Grok reads that receipt before updating Boulder or reporting completion. `lfg --json start-work launch` is an equivalent command shape.

Planning has its own non-mutating Codex skill launch:

```sh
lfg --json plan ulw-plan --focus "Design the release workflow" --cwd "$PWD"
```

The response reports `skill: "$ulw-plan"`, `skillPath: "skills/ulw-plan/SKILL.md"`, `role: "plan_assist"`, engine `gpt`, app-server as the primary transport, `codex-exec` as the fallback, and `the Codex App thread (optional receipt only if --result-path is set)` as the monitoring receipt. Grok does not run Prometheus planning in-host; it launches Codex, monitors the RESULT/plan artifact, presents it for approval, and stops. Optional gjc deep-interview remains a pre-plan gateway only when ambiguity is high or an interview is needed.

Machine transport fields are `transport.primary: "app-server"` and `transport.fallback: "codex-exec"`.

After approval, implementation is a separate lane: `lfg --json handoff plan --role coding --engine gpt --focus "..."` submits the product body to the Codex app-server. The plan skill is not the implementation worker.

Singleton inputs are `--role`, `--engine`, `--focus`, `--deliverable`, `--result-path`, `--payload-file`, `--model`, and `--cwd`. Repeatable inputs are `--scope`, `--out-of-scope`, `--accept`, `--image`, and `--verify`. Safety inputs are `--read-only` and `--yolo`. Unknown flags, missing values, duplicate singleton flags, unsupported roles or engines, and read-only work combined with `--yolo` fail closed.

A valid response contains `ok`, `status`, `command`, `subcommand`, `dryRun`, `executed`, `handoff`, `readiness`, `transport`, `orchestrator`, and `lfgIsPlugin`. `dryRun: true` describes the retained launch plan; `executed: true` means the brief was submitted through app-server. `executed: false` is reserved for planning/not-ready results and `codex-exec-fallback`. `lfgIsPlugin: false` remains invariant.

Visual handoffs also return `visionConfirmation`. When a visual role or visual-intent classifier is paired with one or more `--image` paths, lfg invokes bounded `agy --print` as an independent read-only confirmation gateway. Its machine result is `pass`, `fail`, `uncertain`, or `skipped`, with a bounded `<lfg-agy-vision-confirm>` context block. Missing agy returns `skipped`. This check is always `optional: true` and `blocking: false`: Codex remains the sole implementer, and missing or failed agy never changes the primary handoff status.

| Status | Meaning |
| --- | --- |
| `handed_off` | The brief was submitted to a created or attached Codex app-server thread. |
| `planned` | The handoff was built but no app-server submission occurred. |
| `not_ready` | The handoff was built, but the selected binary was not executable on `PATH`. |

Malformed input returns structured JSON and exit code 1. `not_ready` also exits 1 but retains the complete handoff so the caller can inspect it. `--no-probe` sets readiness `checked: false` and keeps the result deterministic.

Readiness checks executable presence on `PATH` only, including absolute paths and Windows executable extensions. It does not inspect credentials, contact a provider, or start a process. The command never reads or writes the payload/result file, changes Grok config, or mutates the plugin tree.

## Engine and roles

| Engine id | Binary | OMO family | Default roles |
| --- | --- | --- | --- |
| `gpt` | Codex app-server; `codex exec` fallback | GPT | every external worker role |

Legacy config/input aliases `claude`, `agy`, and `gemini` normalize to `gpt` for compatibility; they are not first-class engines. Codex authentication stays host-owned. Roles sisyphus, default, prometheus, atlas, and orchestrator stay on Grok and must not be handed off.

## Launch transport

`planOmoHandoff()` returns the complete worker prompt and a launch plan. Inline prompts are ordinary `launch.argv` values. With `--payload-file`, `launch.stdinSource` is a file descriptor (`kind: "file"`, `path: "..."`) and argv tells the selected CLI to consume stdin. The planner does not open that path.

The app-server transport is primary. When the receipt reports `codex-exec-fallback`, use `launch.argv[0]` as the process executable and `launch.argv.slice(1)` as its argument array, plus optional `launch.cwd` and `launch.stdinSource`. `launch.binary` is identity/readiness metadata and must not be prepended to the already-complete argv vector. `launch.example` is display-only. Read-only work uses the Codex read-only sandbox.

The host runner owns `background: true` and `timeout: 0`; cancellation must kill the worker process group. lfg does not supervise the process or ingest its result.

## Core API

```ts
import { planOmoHandoff } from "src/core/lfg/external-engine"

const handoff = planOmoHandoff({
  role: "coding",
  focus: "Add bounded retry",
  scopePaths: ["src/retry.ts"],
  agentsMdExcerpt: "...",
  skillExcerpts: { programming: "..." },
  verifyCommands: ["npm test"],
})
```

The returned package includes `workerPrompt`, `payloadMarkdown`, `launch`, `fullyTransferable`, and `grokIsOrchestrator`.

## Scope honesty

- Product implementation always uses the external GPT handoff. In-host `spawn_subagent` is limited to watcher/explorer/git-master host work.
- The eval MCP executes bounded code snippets; it does not plan or launch AI workers.
- Grok hooks do not run inside Codex. Required AGENTS.md and skill excerpts must be embedded in the handoff.
- This is OMO-like role routing, not a claim of complete OpenCode transforms or equivalent OMO host surfaces.

## Codex app-server transport

`lfg --json orchestrator watch` best-effort starts the local Codex app-server daemon, connects through `codex app-server proxy`, initializes the JSON-RPC session, and calls `thread/list`. It syncs matching live thread IDs and statuses into `.omo/orchestrator/inbox.json`. `orchestrator threads` returns the live list beside durable ledger threads.

This is a local Codex CLI control plane, not a native Grok `codex_app` tool and not an install dependency. GPT handoff uses `thread/list`, attaches the project thread when present, otherwise uses `thread/start` (or `thread/resume` for an explicit id), then submits the worker brief with `turn/start`. If the daemon/proxy is unavailable, the receipt says `codex-exec-fallback` and preserves the executable `handoff.launch`; M2 continues polling every registered `resultPath`.

## Skill and related docs

- Default: Codex App via `lfg --json handoff plan --engine gpt` (no separate skill required)
- Core: `src/core/lfg/external-engine/` (`planOmoHandoff`)
- In-host topology: `docs/grok-multimodel-topology.md`
