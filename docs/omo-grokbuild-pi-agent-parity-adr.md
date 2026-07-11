# OMO GrokBuild and pi-agent Parity ADR

## Status

Proposed implementation contract for the approved ultragoal story.

## Decision

lfg will treat OMO parity for GrokBuild and pi-agent as a **matrix-first Architecture ADR with proof-first safeguards**. The governing rule is **Host-native first**: prefer a GrokBuild or pi-agent-native surface that actually works over literal Codex/OpenCode structure cloning.

The pi-agent route is not a second OMO runtime by default. Repository evidence currently proves `pi-agent run` selection, required shared `~/.grok` files, no automatic fallback, and xAI/OpenAI-compatible auth env injection. That is **pi-agent route/auth proof** and **adapter launch/auth proof only**. It never upgrades an OMO component to behavior parity by itself.

Because public Pi-family tooling may use `pi` and `.pi` configuration rather than this repo's `pi-agent run` adapter contract, every pi-agent row must identify the exact target: `pi-agent run`, external `pi`, or both. When both are in scope, the row must separate repo adapter-route proof from external Pi runtime behavior proof.

## Config Root Separation: `pi-agent run` vs `omo-senpi` / `senpi`

The distinction `pi-agent run vs omo-senpi` ensures honest adapter proof boundaries and prevents conflating GrokBuild `~/.grok` surfaces with upstream's separate `~/.senpi` control plane.

- **`pi-agent run`** (lfg adapter launch path): Targets `~/.grok` exclusively for plugins (`~/.grok/plugins/lfg` and companion `~/.grok/plugins/lfg-mcp`), `config.toml`, agents, prompts, MCP manifests, stamps (`lfg-install.json`), and shared state. This is the GrokBuild surface. `setup --run` and `pi-agent run` route proof is limited to launch/auth + `~/.grok` visibility. No automatic writes to other roots.

- **`omo-senpi` / `senpi`**: Uses dedicated `~/.senpi` root for senpi-task RPCs, team-core coordination, Pi extraction flows, and omo-senpi agent sessions. This is upstream's separate control plane (see orchestration-plane ADR). lfg does not manage, install into, or claim parity for `~/.senpi` paths. Config collision is avoided by design.

This explicit separation keeps `pi-agent run` evidence honest (adapter/auth only) and defers full omo-senpi behavioral parity (task/team RPC plane). Public Pi tooling may prefer `.pi` over either; rows must call this out.

## Decision drivers

1. **Status honesty:** keep `Implemented`, `Grok-adapted`, `Manifest-only`, `Remote URL manifest-only`, `Unsupported`, and `Deferred` meaningful.
2. **Evidence class separation:** behavior proof, payload/skill usability proof, manifest shape proof, adapter launch/auth proof, planned proof, blocked/missing host surface, and impossible/not-applicable proof are different claims.
3. **Host fit:** OMO behavior should map onto actual GrokBuild/pi-agent surfaces: hooks, MCP runtimes, skills, subagent routing, config, launch/auth, or an explicitly missing host surface.
4. **Ralplan-ready decomposition:** every row must leave a concrete follow-up question that can become an implementation or proof story after approval.

## Proof taxonomy

| Proof class | Meaning | Cannot be used as |
|---|---|---|
| behavior proof | Observed runtime behavior on the target host surface. | Not transferable to another host without evidence. |
| payload/skill usability proof | Skill, prompt, or payload is installed and visible/usable. | Not proof of hooks, MCP calls, or live workflow behavior. |
| manifest shape proof | Manifest/config shape is present and valid. | Not proof the remote/local tool behavior works. |
| adapter launch/auth proof | `pi-agent run`, required files, no fallback, and auth/env routing are correct. | Not proof of OMO component behavior inside pi-agent. |
| planned proof | A future verification method is defined. | Not observed evidence. |
| blocked/missing host surface | A required lifecycle/tool/session surface is absent or unverified. | Not a failure unless the ADR promised implementation. |
| impossible/not-applicable proof | The component is intentionally unsupported or outside runtime scope. | Not a hidden TODO unless the row names a host-native alternative. |

## Matrix

| Component | Current status | Rejudged status | GrokBuild recommendation | pi-agent recommendation | Observed evidence | Planned proof | Blocked/N/A reason | Ralplan follow-up questions |
|---|---|---|---|---|---|---|---|---|
| `comment-checker` | Grok-adapted | Grok-adapted | Keep native Grok `PostToolUse` hook. | Target `pi-agent run`; prove comment feedback only if pi-agent exposes equivalent edit/tool lifecycle, otherwise mark not-applicable for hook behavior. | `hooks/lfg-native-comment-checker.mjs`; T2 behavior proof in inventory. | Edit noisy/clean fixtures through target host and observe bounded feedback or silence. | Missing pi-agent lifecycle evidence. | Does pi-agent emit an edit/post-tool lifecycle payload compatible with this hook? |
| `git-bash` | Manifest-only | Manifest-only | Keep disabled/nonbehavioral on macOS and Windows-unverified. | Same: no pi-agent behavior claim. | Manifest/runtime copy capability only; disabled via `disabled_mcp_servers`. | Windows behavior proof only after host policy is approved. | Platform-gated and behavior-unverified. | Is Windows support a product requirement for pi-agent? |
| `rules` | Grok-adapted | Grok-adapted | Keep rules-engine core plus Grok PostToolUse/UserPromptSubmit glue. | Target `pi-agent run`; prove rule context only if pi-agent can consume injected context or equivalent prompt augmentation. | `src/core/omo/rules-engine`, `rules-injector.ts`, bridge support. | Trigger rule-matching project context in pi-agent and capture transcript. | Unknown prompt/context injection surface. | Does pi-agent expose a prompt-context injection mechanism? |
| `lsp` | Grok-adapted | Grok-adapted | Keep `typescript_diagnostics` MCP runtime. | Treat as MCP/tool behavior proof only if pi-agent can invoke the same MCP/runtime. | `lfg-lsp` exposes `typescript_diagnostics`; T5 proof. | Run dirty/clean TS diagnostic cases from pi-agent tool surface. | pi-agent MCP invocation surface unproven. | Can pi-agent load lfg MCP runtimes from `~/.grok/plugins/lfg`? |
| `ast_grep` | Grok-adapted | Grok-adapted | Keep `ast_grep_search` MCP runtime. | Same as lsp: require pi-agent MCP/tool proof. | T4 `ast_grep_search` behavior proof. | Structural search from pi-agent with valid and malformed patterns. | pi-agent MCP invocation surface unproven. | Does pi-agent expose MCP tool execution compatible with lfg runtime manifests? |
| `codegraph` | Grok-adapted | Grok-adapted | Keep external semantic-code-graph provisioning and command server. | Require pi-agent MCP/server proof before behavior claim. | Codegraph provisioning and `.mcp.json` server design. | Run codegraph query through pi-agent target surface. | External binary availability and pi-agent MCP surface both need proof. | Should codegraph be shared through Grok home or a Pi-native config? |
| `grep_app` | Remote URL manifest-only | Remote URL manifest-only | Keep remote URL manifest-only unless live-call policy changes. | Same. | URL manifest shape only. | None unless network/live-call policy is approved. | Remote external service; no default live call. | Are remote MCP live calls allowed for parity proof? |
| `context7` | Remote URL manifest-only | Remote URL manifest-only | Keep remote URL manifest-only unless live-call policy changes. | Same. | URL manifest shape only. | None unless network/live-call policy is approved. | Remote external service; no default live call. | Are remote MCP live calls allowed for parity proof? |
| `ultrawork` | Grok-adapted | Grok-adapted | Keep native/bridged ultrawork OMO hook and agent surfaces. | Require target-specific proof that pi-agent can see/use ultrawork prompt or hook context. | Native first-party OMO hook and synced agents. | Submit ultrawork-triggering prompt in pi-agent and capture surfaced guidance. | pi-agent hook/prompt injection surface unproven. | Is pi-agent expected to consume Grok hooks or only shared skill text? |
| `ulw-loop` | Grok-adapted | Grok-adapted | Keep project `.omo` awareness and upstream skill payload; durable CLI packaged as `lfg ulw-loop` / `lfg ulw`. | Prove pi-agent can use skill workflow, shared `.omo` context, and/or `lfg ulw-loop` CLI. | `lfg-config-loader.mjs`; installed `ulw-loop` skill; `src/core/omo/ulw-loop` CLI. | pi-agent transcript showing skill/context usability and optional CLI status. | pi-agent skill surface may still need proof. | Prefer `lfg ulw-loop` over external `omo` for GrokBuild. |
| `ulw-plan` | Grok-adapted | Grok-adapted | Keep upstream skill payload and scaffold script availability. | Prove pi-agent can invoke/read the skill guidance and produce planning handoff. | Installed `ulw-plan` skill and scaffold script. | pi-agent planning transcript with skill surface. | pi-agent skill discovery surface unproven. | Does pi-agent read Grok skill roots or need `.pi` skill sync? |
| `ultimate-browsing` | Implemented | Implemented, payload-only | Keep skill payload availability honest; no separate stealth-browser runtime claim. | Prove skill usability only; behavior requires separate browser/runtime evidence. | Installed skill payload, engine, scripts, metadata. | pi-agent skill visibility/use transcript. | No lfg-owned stealth runtime behavior. | Is ultimate-browsing behavior proof required or only skill availability? |
| `bootstrap` | Deferred | Deferred / missing host surface | Do not bootstrap Codex runtime deps from Grok setup. | Same unless Pi-native dependency bootstrap is explicitly designed. | Deferred inventory evidence. | ADR-only missing-surface statement. | Host-owned dependency bootstrap policy absent. | Is any bootstrap behavior safe or desirable for Grok/Pi? |
| `auto-update` | Unsupported | Unsupported / intentional N/A | Keep updates user-controlled. | Same. | Unsupported policy. | None. | Auto-updating installed agent runtime is outside lfg contract. | Should any manual update reminder replace auto-update? |
| `start-work-continuation` | Deferred | Deferred with Sisyphus/Ultragoal substitute | Keep Sisyphus Stop/SubagentStop context and Ultragoal ledger flow; no automatic reinjection claim. | Prove only if pi-agent has continuation/re-entry surface; otherwise missing host surface. | `lfg-sisyphus-hooks.mjs` final/delegation guidance; durable CLI not packaged. | Host continuation proof or not-applicable rationale. | Automatic lifecycle reinjection unavailable. | Should Ultragoal stable ledger replace continuation for this repo? |
| `prompts-core` | Grok-adapted | Grok-adapted | Keep host-neutral prompt variants and Grok adapter fallback chain. | Prove prompt variant use only if pi-agent consumes same prompt assembly or equivalent. | `src/core/omo/prompts-core`; Grok adapter. | pi-agent prompt selection transcript/config evidence. | pi-agent prompt assembly surface unproven. | Is pi-agent using lfg prompt adapter or a separate `.pi` prompt system? |
| `agent-builder` | Grok-adapted | Grok-adapted, partial builtin caveat | Keep curated registry and Grok role assembly; host-bound agents remain deferred. | Require explicit mapping to pi-agent subagents/roles. | `src/core/omo/agent-builder`; partial port evidence. | pi-agent role/subagent mapping proof. | Pi role model may differ from Grok agents. | Which pi-agent subagent names correspond to OMO roles? |
| `delegate-core` | Grok-adapted | Grok-adapted | Keep host-neutral model selection and retry guidance. | Prove mapping to pi-agent delegation only after target surface is known. | `src/core/omo/delegate-core`; Grok glue. | pi-agent delegation route proof. | pi-agent delegation API unconfirmed. | Is `spawn_subagent` available in pi-agent, external `pi`, or neither? |
| `boulder-state` | Grok-adapted | Grok-adapted | Keep `.omo/plans` bridge and durable state. | Prove pi-agent can read/write intended project-local state or treat as shared filesystem state. | `src/core/omo/boulder-state`; `.omo/plans` bridge. | pi-agent plan checklist/state transcript. | State ownership across hosts must stay explicit. | Should Pi-specific state live in `.omo`, `.pi`, or both? |
| `skills-loader-core` | Grok-adapted | Grok-adapted | Keep host-neutral loader and Grok skill roots. | Prove pi-agent skill root discovery (`~/.grok`); external `pi` may need `.pi` sync; omo-senpi uses separate `~/.senpi` (see Config Root Separation). | `src/core/omo/skills-loader-core`; Grok adapter. | pi-agent/external Pi skill discovery proof. | target skill root unknown. | Does the actual Pi target read `~/.grok/plugins/lfg/skills`? |
| `teammode` | Deferred | Deferred / missing session surface | Keep skill payload only; thread-title hook not adapted. | Require Pi session/thread equivalent before behavior claim. | Upstream skill payload installed; `codex_app.create_thread` hook missing. | Session/thread surface proof or not-applicable. | Grok/Pi thread orchestration surface absent. | What host-native session/thread primitive replaces `codex_app.create_thread`? |
| `lazycodex-executor-verify` | Deferred | Deferred / host-specific verifier needed | Adapt only after Grok/Pi subagent naming and stop events are known. | Same. | Codex `lazycodex-executor` verifier targets different agent/event names. | SubagentStop/evidence receipt proof. | pi-agent subagent lifecycle unknown. | What is the target executor role and completion event in pi-agent? |
| `workflow-selector` | Deferred | Deferred / authenticated host receipt needed | The post-v4.13.0 contract at `e222452b874eb65d550fafb1d08d3aaf0d20418f` is staged as opt-in native `lfg-native-workflow-selector.mjs`; do not promote before real Grok execution evidence. | Same for pi-agent. | UserPromptSubmit hook with bounded `additionalContext`; fresh temp-home direct installed-command proof exists, authenticated host receipt pending. | Authenticated prompt-routing proof. | Real host execution receipt is unverified. | Does pi-agent support pre-prompt workflow selection context? |
| `test-support` | Unsupported | Unsupported / non-runtime | Keep out of runtime payload. | Same. | Upstream package test infrastructure only. | None. | Not user-facing runtime behavior. | Are any test-support utilities useful only as dev fixtures? |
| `telemetry` | Unsupported | Unsupported / intentional N/A | Keep telemetry disabled. | Same. | lfg does not emit upstream anonymous telemetry. | None. | Privacy/policy choice. | None unless telemetry policy changes. |
| `plan-mode-interception` | Deferred doc-only host-surface row | Deferred / missing Plan Mode interception | Keep as hook-time guidance only; no native Plan Mode interception claim. | Require pi-agent planning-mode equivalent before claim. | parity doc hook event matrix; no inventory row. | Host planning-mode proof. | No verified Grok/Pi `enter_plan_mode` interception surface. | Should `/ulw-plan`/ralplan remain the host-native planning path instead? |

## Consequences

- Some rows intentionally remain non-behavioral until proof exists.
- `pi-agent run` ( `~/.grok` config root) is distinct from `omo-senpi`/`senpi` (`~/.senpi` root) and from public `pi`/`.pi` tooling. The new Config Root Separation section makes this invariant explicit; lfg claims only GrokBuild + `pi-agent run` adapter launch/auth proof for `~/.grok`.
- If external `pi` is in scope, a separate column or row note must cover `.pi` config/skill behavior rather than assuming Grok plugin consumption.
- Later implementation must update docs/tests together because `docs/grok-adapter-parity.md` is tested contract material.

## Follow-up story clusters after approval

1. **ADR/doc-contract cluster:** Add this ADR as a tested doc and wire exact phrase assertions (including config-root separation).
2. **pi-agent target discovery cluster:** Prove whether target is repo `pi-agent run` (`~/.grok`), external `pi`/`.pi`, or omo-senpi (`~/.senpi`); the separation section already documents the `~/.grok` vs `~/.senpi` boundary.
3. **Grok behavior proof cluster:** Preserve and expand behavior-backed rows only where current tests or live proofs exist.
4. **pi-agent live proof cluster:** Add route/auth, skill discovery, MCP invocation, prompt/context injection, and subagent lifecycle proofs as separate rows or stories.
5. **Deferred-host-surface cluster:** Decide substitutes for workflow-selector, teammode, start-work-continuation, lazycodex-executor-verify, bootstrap, and plan-mode-interception.
6. **Manifest/remote/unsupported policy cluster:** Keep nonbehavioral rows honest unless live-call or platform policy changes.

## Verification

Planning/doc verification:
- Run the paired doc-contract test for this ADR.
- If the parity table or inventory changes, run `npm run assert-omo-parity`.
- If `docs/grok-adapter-parity.md` changes, run `src/cli/docs/grok-adapter-parity-doc.test.ts`.
- Implementation-stage tests must match touched surfaces: adapter tests for pi-agent route/auth, MCP tests for MCP behavior, hook tests for lifecycle behavior, and package setup tests for installed payloads.
