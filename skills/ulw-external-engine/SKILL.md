---
name: ulw-external-engine
description: >
  Grok orchestrator hands scoped jobs to local Codex (gpt). Word/skill assign exists
  so Grok can task Codex better. Triggers: handoff, external engine, codex, lazycodex,
  implement, fix, review, oracle, delegate-codex, ulw-external-engine.
---

# Grok watcher → Codex LazyCodex

| Role | Who |
| --- | --- |
| Orchestrator / watcher | **Grok** (plan, ulw-loop, ledger, RESULT) |
| Intent gateway | **gjc** (classify ambiguity and refine focus only) |
| Sole implementer | **Codex CLI** via engine **`gpt`** |

Word/skill-assign hooks and this skill exist for **one purpose**: help Grok assign work to Codex better. Not multi-agent zoo. Not Grok self-implementation.

This is an **OMO-like** Sisyphus handoff contract: historical coding / hephaestus / vision role names may describe the job, but every worker role resolves to the sole Codex lane. There is **no parallel Grok hephaestus for the same body**.

## Plan

```sh
lfg --json handoff plan --role coding --engine gpt --focus "scoped job"
```

Use `handoff.payloadMarkdown` and `handoff.launch`. Plan always sets
`grokIsOrchestrator`, `fullyTransferable`, and `noGrokSubagentsRequired`.

## Role → engine

All worker roles map to **gpt** (Codex). Retired aliases (`claude`, `agy`, `gemini`) normalize to gpt.

Do **not** hand off watcher/orchestrator work — that stays on Grok.

## Transport

Create or attach the project Codex app-server thread and submit the payload there.
Only when the daemon is unavailable, use the reported `codex-exec-fallback`:
`handoff.launch.argv[0]` is the executable and `handoff.launch.argv.slice(1)` is
its argument array. If `handoff.launch.stdinSource.kind` is `file`, pipe that file
to stdin. Run fallback with `timeout: 0`; cancellation kills the process group.

## Orchestrator checklist

1. Read the `lfg-gjc-intent-gateway` UserPromptSubmit context. If ambiguity is high, clarify first; otherwise use its refined focus as advisory input.
2. Grok plans / picks next checkbox (ulw-plan, start-work, ulw-loop).
3. `lfg --json handoff plan --role <role> --engine gpt --focus <focus>`.
4. Submit to the project Codex app-server thread — Grok does not implement the same body.
5. Keep M1–M5 open every turn: inbox asks, all RESULT paths, app-server list/status via `lfg --json orchestrator watch`, residual asks, and answer receipts. Re-scan before replying.
6. Read RESULT (`STATUS` / `SUMMARY` / `EVIDENCE` / `CHANGED_FILES` / `RISKS`) into ledger.
7. Continue as watcher.

## Honesty

- Hooks do not auto-run on Codex — embed rules/skills as text in the payload.
- Only engine: **gpt** → **codex**.
- gjc is an optional fail-open intent gateway, never the product implementer and never a launch engine.

## Related

- `docs/grok-external-engine-orchestration.md`
