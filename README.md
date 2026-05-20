# lfg: OMO Agent Hierarchy Parity for Grok Build

**OMO agent hierarchy parity for Grok Build — Full Real Port in Progress.**

`lfg` is a Python-first plugin runtime and Grok marketplace plugin that ports the **complete, authentic production oh-my-openagent (OMO)** agent hierarchy and orchestration engine into LFG / Grok Build.

**The goal is not a lightweight command demo.** The goal is a Grok-native agent operating system with real Sisyphus orchestration, Prometheus planning, Atlas checklist execution, Hephaestus deep work, Sisyphus-Junior category execution, Hyperplan adversarial teams, Boulder + Ralph "never stops" persistence, 5-tier defensive hooks, IntentGate `ulw` bootstrap, and full Team Mode — powered by multi-provider execution with Grok as the orchestrator/reviewer and Grok-native sub-agent spawning where available.

The canonical implementation is now lfg-native under `plugins/lfg/src/agents/`, `plugins/lfg/bin/`, skills, hooks, MCP, and `.lfg/` runtime state.

First-class agents default to Grok model profiles for Grok Build execution except Hephaestus, which requires an approved GPT-style deep-specialist profile. Oracle review remains mandatory through the xAI/Grok gate. LFG may route execution through approved optional providers (`codex`, `copilot`, `zai`) when available; `zai` uses a smoke-safe Z.ai/Zhipu HTTP adapter with `ZAI_API_KEY` or `ZHIPU_API_KEY` only for explicit `--run` calls.

## Product Scope

`lfg` provides an OMO-style runtime surface for Grok Build:

- Agent hierarchy: the canonical 11 OMO agents plus builtin-agents policy layer, with eligibility contracts enforced in runtime
- Orchestration: task delegation, category routing, dependency waves, hostile critique, lead synthesis, hyperplan 3-round adversarial
- Durable state: Boulder, continuation (Ralph-loop + TodoContinuationEnforcer), mailbox, shared tasklist, notepads, plans, team runtime
- Team execution: tmux-backed local observability plus manual-gated Grok sub-agent fallback envelopes until real T28 evidence exists
- "Magic" entrypoints: `ulw` / `ultrawork` keyword + IntentGate + model-specific Grok preambles
- Quality gates: evidence strings (`*=ok`), critic review, tests, manual verification, release gates
- Integration surfaces: Grok skills, hooks (5-tier safeCreateHook), MCP tools, CLI wrappers, marketplace metadata

## Install Through Grok Marketplace

The intended install path is inside Grok:

1. Open LFG / Grok Build.
2. Open the extensions modal with `/plugins`.
3. Add the LFG marketplace source URL:

   ```text
   https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json
   ```

4. Install/add `lfg` from that marketplace.
5. Enable the plugin.
6. Verify it discovers agent definitions, skills, hooks, MCP server, and runtime helpers.

Grok is fully compatible with Claude Code plugin surfaces. LFG keeps `.agents/plugins/marketplace.json` and `plugins/lfg/.claude-plugin/plugin.json` as compatibility references, with `.grok/` files maintained as Grok-facing aliases whose shared fields are smoke-tested for alignment.

Marketplace/package identity:

```text
Marketplace: islee23520
Package:     islee23520/lfg
Plugin id:   lfg
Repository:  https://github.com/islee23520/lfg
Marketplace source repo: https://github.com/islee23520/lfg.git
Reference:   oh-my-openagent agent hierarchy and orchestration model (full real port)
```

Developer smoke commands live in [`docs/SMOKE.md`](docs/SMOKE.md). Marketplace installation remains the primary product path; local editable install is for development and preview only.

## Agent Hierarchy

### Sisyphus

Main orchestrator. Owns user intent, dispatches specialists, tracks completion, enforces verification, and persists progress through Boulder state. The default lead for `ulw`.

### Sisyphus-Junior

Focused executor spawned by category routing. It executes a bounded task, verifies its own changes, and does not become a second unconstrained orchestrator.

### Prometheus

Strategic planner. Interviews, clarifies scope, reads context, and produces a verifiable plan before implementation starts. (Plan-only; hard-reject as team member per eligibility contract.)

### Hephaestus

Autonomous deep worker. Receives goals, not recipes. It researches, implements, and verifies difficult work with strong evidence discipline. Hephaestus requires an approved GPT-style deep-specialist profile (`openai/gpt-5.5` or Copilot GPT-5.5) and blocks mismatched cheap/utility model overrides instead of silently degrading. (Conditional teammate.)

### Atlas

Todo-list orchestrator. Reads a plan, executes dependency waves, updates checkboxes, verifies every step, and continues until the checklist is complete.

### builtin-agents

Factory and policy layer. Resolves model profile, category, skill availability, overrides, blocked tools, and registration conditions. Enforces the real `AGENT_ELIGIBILITY_REGISTRY`.

### Full 11-Agent Catalog (Phase 2 Ported)

The lfg-native registry starts with Sisyphus, Atlas, Sisyphus-Junior, Hephaestus, Prometheus, and builtin-agents, with legacy named agents kept only for compatibility under `plugins/lfg/src/agents/legacy/`.

## Grok Build Execution Model

`lfg` maps OMO-style delegation onto Grok Build:

```text
Sisyphus receives request
  ├─ Prometheus plans if scope is non-trivial
  ├─ Atlas executes plan waves
  ├─ Sisyphus-Junior handles category tasks
  ├─ Hephaestus handles autonomous deep goals
  ├─ Hyperplan spawns hostile critics for adversarial planning
  └─ Sisyphus synthesizes, verifies, and advances Boulder
```

Agent entries default to Grok models for Grok Build execution except Hephaestus, whose OMO deep-specialist contract requires a GPT-style approved profile. Category routing may keep Grok reasoning profiles or use approved optional providers (`codex`, `copilot`, `zai`) for bounded execution or consultation lanes (`zai` is an HTTP/API adapter, not a required local CLI), but every completion still carries the mandatory xAI/Grok Oracle review envelope. OpenAI/GPT, Copilot, Gemini, and Z.ai consultation cannot replace that product gate.

The next integration focus is replacing fallback/manual-gated spawn evidence with verified Grok-native sub-agent spawning after the T28 manual gate passes, while keeping `.lfg/` state, approved multi-provider routing, and Oracle review contracts stable.

## Full Real OMO Port — Phase 2 Complete (Big Synthesis)

**Official Ultragoal**: `omo-full-real-port-20260518` ("full real OMO as-is, ulw ulw with team mode on").

After a massive 14+ parallel ULW explorer swarm mapped the entire production OMO engine, the Huge Orchestration Team (ULW) executed Phase 2: shipping **7 core modules** of portable, high-fidelity logic:

1. **Eligibility Contracts** (`contracts/eligibility.json` + `team/eligibility.py`) — verbatim `AGENT_ELIGIBILITY_REGISTRY` + hyperplan roster (`eligibility-contract-shipped=ok`)
2. **Agents Catalog** (`agents/`) — all 11 real agents with identities and prompt loading (`agent-catalog-impl=ok`)
3. **Ultrawork IntentGate** (`ultrawork/`) — keyword detection + Grok-4-3 harness preambles + bootstrap (`ultrawork-intentgate-impl=ok`)
4. **BackgroundManager + Tmux Viz** (`background/`) — parallel delegation engine + live visibility (`background-manager-impl=ok`)
5. **5-Tier Hooks** (`hooks/`) — `safeCreateHook` + defensive validators (`hooks-5tier-impl=ok`)
6. **Team Runtime** (`team/`) — Hyperplan executor (exact 3-round adversarial + handoff), Mailbox, Tasklist (`team-runtime-hyperplan-impl=ok`)
7. **Config / Doctor / Named Teams** (`config/`) — 3-layer loading, discovery, self-diagnostics, `team create hyperplan` (`doctor-named-teams-impl=ok`)

**Plus cross-cutting Persistence** (`persistence/`) — Boulder + Ralph-loop + `TodoContinuationEnforcer` + `SYSTEM DIRECTIVE` ("never stops until done") — `persistence-boulder-ralph-impl=ok`

All modules are dependency-light Python, directly portable into `~/.grok/plugins/grok-build/omo/`, and exercised with live evidence strings.

**"The boulder is moving. The real OMO engine is here."**

## Runtime Commands

The current CLI exposes stable JSON surfaces for the OMO parity runtime:

```sh
plugins/lfg/bin/lfg agents list
plugins/lfg/bin/lfg agents inspect sisyphus
plugins/lfg/bin/lfg route --category quick --task "execute a bounded smoke task"
plugins/lfg/bin/lfg spawn sisyphus-junior --category quick --task "fix failing smoke"
plugins/lfg/bin/lfg hephaestus goal "port Boulder state"
plugins/lfg/bin/lfg hyperplan "design Grok spawn adapter"
plugins/lfg/bin/lfg plan create "ship OMO registry" --steps "inspect;implement;verify"
plugins/lfg/bin/lfg plan list
plugins/lfg/bin/lfg atlas start-work --plan-id <plan-id>
plugins/lfg/bin/lfg atlas status --plan-id <plan-id>
plugins/lfg/bin/lfg atlas checkbox --plan-id <plan-id> --task 1 --status complete --evidence "command output captured"
plugins/lfg/bin/lfg provider list
plugins/lfg/bin/lfg provider show openai-main
plugins/lfg/bin/lfg models
plugins/lfg/bin/lfg doctor
plugins/lfg/bin/lfg doctor state schema check
plugins/lfg/bin/lfg team providers
plugins/lfg/bin/lfg team preflight
plugins/lfg/bin/lfg team create 3:executor "verify release gates"
plugins/lfg/bin/lfg team state <team-name>
plugins/lfg/bin/lfg setup
plugins/lfg/bin/lfg auth login openai --id openai-main --env OPENAI_API_KEY
plugins/lfg/bin/lfg omx-setup check
```

`omx-setup` remains the documented compatibility surface during the rename transition.

Runtime state is stored under:

```text
.lfg/
```

`lfg models` shows default Grok-first model profiles plus configured provider metadata. `lfg auth login` records provider login metadata by environment variable name only; it never stores API keys.

`lfg setup` syncs the current plugin package into `~/.grok/plugins/lfg` (or `--plugin-dir <path>`) and records setup state under `.lfg/state/setup.json`. When run from an interactive terminal, `lfg setup` automatically opens the OMO-style provider/subscription wizard for OpenAI, Z.ai, Copilot, and Codex; Grok Build/xAI login is assumed by the host and is not asked in the wizard. Use `--interactive` only to force the wizard, or `lfg setup --no-tui --openai yes --zai yes --copilot no --codex no` for deterministic automation. `lfg auth login` without arguments lets you pick from configured providers, and all auth/provider forms store only environment variable names, never secret values.

Target state layout:

```text
.lfg/
  agents/
  boulder/
  plans/
  teams/
  hyperplan/
  notepads/
  mailbox/
  tasklists/
```

## Team Mode

Team Mode is the durable multi-agent execution surface. It combines OMO mailbox/tasklist semantics with local tmux observability, optional external coding providers, and canonical manual-gated Grok sub-agent fallback envelopes until real native evidence exists.

Target flow:

```text
/team providers
/team preflight
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

Equivalent local runtime:

```sh
plugins/lfg/bin/lfg team providers
plugins/lfg/bin/lfg team preflight
plugins/lfg/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/lfg/bin/lfg team status <team-name>
plugins/lfg/bin/lfg team resume <team-name>
plugins/lfg/bin/lfg team shutdown <team-name>
```

The smoke-safe provider remains `noop` for dependency-free tests and preflight examples.

## Verify

Install development lint tooling when preparing local changes:

```sh
python3 -m pip install -e .[dev]
python3 -m ruff check .
```

Run dependency-free smoke tests:

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
```

Run plugin self-test:

```sh
python3 plugins/lfg/bin/self-test.py
```

Run real local Grok install/discovery smoke when `~/.grok/bin/grok` is available:

```sh
python3 plugins/lfg/bin/grok-install-smoke.py
```

Run full local release readiness when preparing release:

```sh
python3 plugins/lfg/bin/self-test.py
```

Remote marketplace/Grok UI evidence is environment-specific and should be recorded separately when release scope requires it.

See [`docs/SMOKE.md`](docs/SMOKE.md), [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md), and [`docs/TEST_RULES.md`](docs/TEST_RULES.md) for the exact evidence contracts.

## Layout

```text
.grok/plugins/marketplace.json           # Grok marketplace metadata
.agents/plugins/marketplace.json         # Agents-compatible marketplace metadata
plugins/lfg/
  .grok-plugin/plugin.json               # Grok plugin manifest
  .claude-plugin/plugin.json             # compatibility manifest
  .mcp.json                              # MCP server config
  src/agents/harness.toml                # agent harness metadata (canonical)
  bin/lfg.py                             # gateway to src/runtime/cli.py
  bin/lfg                                # default runtime wrapper
  bin/ulw                                # ultrawork launcher wrapper
  bin/lfg-mcp.py                         # stdio JSON-RPC MCP server
  bin/self-test.py                       # Python-managed local smoke test
  hooks/hooks.json                       # hook registration
  hooks/plugin smoke checks lfg-audit-hook.sh        # fail-open audit hook
  skills/*/SKILL.md                      # Grok slash surfaces backed by OMO semantics
```

## Roadmap

See [`ROADMAP.md`](ROADMAP.md) for the M0-M13 OMO parity plan.
See the **Full Real OMO Port ultragoal** (`.lfg/ultragoal/omo-full-real-port-20260518/`) and Phase 2 artifacts for the accelerated "as-is" track.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the agent hierarchy, **current runtime implementation** ("How LFG actually works with OMO right now"), Grok spawn adapter status, and verification commands.
See [`docs/AGENTS.md`](docs/AGENTS.md) for documentation and evidence rules.

## Attribution

Built with oh-my-openagent as the architectural reference for agent hierarchy, orchestration discipline, Boulder/continuation, Team Mode, Hyperplan, Prometheus planning, Atlas checklist execution, and Sisyphus-style persistence. `lfg` is a separate Grok Build implementation adapted to Grok marketplace, multi-provider execution with mandatory Grok Oracle review, skills, hooks, MCP, and `.lfg/` state conventions.

**ulw ulw with team mode on.**
