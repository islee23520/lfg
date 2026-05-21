# docs/AGENTS.md

## OVERVIEW

Documentation here defines the evidence contract for the OMO-to-Grok Build port. Docs must describe `lfg` as an OMO agent hierarchy parity project: Grok-model agents, explicit native-spawn gates with deterministic/manual fallback envelopes, durable `.lfg/` state, Team Mode, Hyperplan, Boulder, and quality gates.

## WHERE TO LOOK

- `ARCHITECTURE.md`: OMO agent hierarchy, Grok spawn adapter, state layout, Team Mode, Hyperplan.
- `TEST_RULES.md`: Gate classes, deterministic rules, and required test commands.
- `SMOKE.md`: Local, focused, real Grok, remote, and full release-readiness smoke procedures.
- `RELEASE_CHECKLIST.md`: Stop condition before merge/tag and required evidence strings.
- `MARKETPLACE_INSTALL.md`: Stable and preview marketplace source URLs.
- `MARKETPLACE_RELEASE_NOTES.md`: User-facing release evidence and install path.
- `RELEASE_TAGS.md`: Tag policy and verification commands.
- `HOOK_EVIDENCE.md`: Hook discovery and replay evidence.
- `GROK-EXTENSIONS-SSOT.md`: Skills, plugins, hooks, marketplaces, subagents, Claude Code compatibility, and AGENTS.md compatibility discovery rules.
- `GROK-BUILD-PROMPT-STAGES.md`: Visual prompt-stage map showing xAI Responses API concepts vs. LFG/OMO orchestration behavior.
- `agent-system/`: Design docs for named agents, categories, team templates, and OMO parity comparisons.
- `evidence/oh-my-openagent-doc-diff.md`: Diff between LFG docs and the local Oh My OpenAgent reference tree.
- `docs-index.json`: **Docs Index Server**. @docs/ 참조 시 에이전트는 반드시 이 파일을 먼저 읽은 후 실제 문서를 Read 해야 함.

## CONVENTIONS

- Treat command blocks and `*=ok` strings as contracts, not prose examples.
- Keep `ROADMAP.md`, `README.md`, `ARCHITECTURE.md`, `SMOKE.md`, `RELEASE_CHECKLIST.md`, and `bun plugins/lfg/bin/self-test.ts` aligned when changing gates.
- Keep all five `AGENTS.md` guides structurally complete and aligned with self-test; Wave 1 validity is proven by `agents-guides-valid=ok`.
- Keep marketplace identity fixed to `islee23520/lfg` unless the package is intentionally renamed.
- Mention whether each gate is dependency-free smoke, repo-native integration, or environment/manual.
- OMO agent names are canonical: Sisyphus, Sisyphus-Junior, Prometheus, Hephaestus, Atlas, builtin-agents.
- Any docs claiming agent behavior must state the verification path or the phase where it will be implemented.

## ANTI-PATTERNS

- Do not present legacy Codex-derived workflow identity as the current north star.
- Do not claim Grok native spawning works without official/local evidence.
- Do not document local-dev install as the primary path when marketplace is intended.
- Do not add release checklist items without a focused command or explicit manual evidence.
- Do not remove known Grok hook limitation evidence unless the corresponding verification script changes.
- Do not let docs claim a gate passes without a concrete evidence string.

## COMMANDS

```sh
bun test plugins/lfg/src/runtime-ts plugins/lfg/src/mcp-ts plugins/lfg/src/hooks-ts plugins/lfg/src/smoke-ts plugins/lfg/test-utils
bun plugins/lfg/bin/self-test.ts
```

## NOTES

- During the OMO parity migration, docs may mention legacy surfaces only as migration targets, never as the product goal.
