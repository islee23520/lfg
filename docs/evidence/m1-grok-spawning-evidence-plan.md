# M1 — Grok Sub-Agent Spawning Evidence Plan

## Purpose

This document defines the official and local evidence needed to prove Grok Build native
sub-agent spawning, maps OMO `task()`/`call_omo_agent` concepts to Grok-native behavior,
and specifies fallback behavior for dependency-free smoke tests. It is the M1 verification
artifact for the OMO parity migration.

---

## 1. Local Evidence: What Is Confirmed

The following is confirmed from the local Grok installation at `~/.grok/bin/grok`
(version `0.1.211 (2f2cd6d5c2)`, captured 2026-05-18).

### 1.1 Grok CLI Flags

From `docs/evidence/cli-surface.md` (captured 2026-05-18T07:04:00Z):

```
--agents <JSON>       Inline subagent definitions as JSON
--no-subagents        Disable subagent spawning
```

These flags confirm that Grok Build has a first-class concept of subagents at the CLI
surface. `--no-subagents` implies subagents are enabled by default.

### 1.2 Official Local Documentation

`~/.grok/docs/user-guide/15-subagents.md` (bundled with the local Grok install) documents
the following as confirmed behavior:

**`task` tool** — the parent agent uses the `task` tool to spawn child agents. Key parameters:

| Parameter       | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `description`   | What the child should do (used as the prompt)                |
| `subagent_type` | Agent type: `general-purpose`, `explore`, `plan`             |
| `persona`       | Optional persona (e.g., `implementer`, `reviewer`)           |
| `prompt`        | Full prompt text for the child agent                         |
| `fork_context`  | If true, child receives parent's conversation history        |
| `resume_from`   | Resume a previous subagent session by ID                     |

**Built-in agent types:**

| Type              | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `general-purpose` | Full-capability agent. Has access to TaskTool for recursive spawning. |
| `explore`         | Read-only research agent. Cannot modify files or run commands. |
| `plan`            | Planning agent. Explores and produces structured plans.      |

**Built-in personas:**

| Persona               | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `implementer`         | Pragmatic coder. Implements changes, runs fmt/clippy.    |
| `reviewer`            | Code reviewer. Reads diffs, writes structured feedback.  |
| `researcher`          | Deep investigator. Searches broadly, writes findings.    |
| `test-writer`         | Test specialist. Writes tests for existing code.         |
| `security-auditor`    | Security analyst. Audits code for vulnerabilities.       |
| `design-doc-writer`   | Technical writer. Produces design documents.             |
| `design-doc-reviewer` | Design reviewer. Reviews docs for gaps and improvements. |

**Capability modes:**

| Mode         | Read | Write | Execute |
| ------------ | ---- | ----- | ------- |
| `read-only`  | Yes  | No    | No      |
| `read-write` | Yes  | Yes   | No      |
| `execute`    | Yes  | Yes   | Yes     |
| `all`        | Yes  | Yes   | Yes     |

**Context inheritance:**
- `fork_context`: child receives copy of parent's conversation history.
- `resume_from`: new subagent continues from a previous subagent's session.

**Depth limits:** subagents can spawn their own subagents up to a configurable depth limit.
Default prevents runaway nesting.

**Worktree isolation:** subagents can run in isolated git worktrees to prevent file conflicts.
Changes are merged back via `x.ai/git/worktree/apply`.

### 1.3 Bundled Role Definitions

From `~/.grok/bundled/roles/`:

```toml
# explore.toml
description = "Fast read-only codebase explorer with parallel search"
default_capability_mode = "read-only"
reasoning_effort = "medium"

# plan.toml
description = "Software architect that designs implementation plans and identifies critical files"
default_capability_mode = "read-only"
reasoning_effort = "high"
```

Custom roles can be defined in `~/.grok/config.toml` under `[subagents.roles.<name>]` or
discovered from `.grok/roles/*.toml` files.

### 1.4 Bundled Persona Definitions

From `~/.grok/bundled/personas/`:

- `implementer.toml`: `default_fork_context = true`, `default_capability_mode = "all"`.
  Defines `[[inputs]]` (`review_file`) and `[[outputs]]` (`summary_file`, `review_file`).
- `researcher.toml`: `model = "grok-build"`, `reasoning_effort = "high"`.

Custom personas can be defined in `~/.grok/config.toml` under `[subagents.personas.<name>]`
or discovered from `.grok/personas/*.toml` files.

### 1.5 Real Usage Evidence from Bundled Skills

`~/.grok/bundled/skills/design/SKILL.md` demonstrates the `task` tool in production use:

```
Task tool parameters:
- subagent_type: "general-purpose"
- description: "Write design doc: <short summary>"
```

Key constraint confirmed from this skill:
> Do NOT pass a `persona` parameter to `spawn_subagent` — that parameter is not supported.
> Persona instructions must be prepended to the prompt text instead.

This is a critical implementation note: the `persona` parameter in the docs table above
describes the behavioral concept, but the actual injection mechanism is prompt-prepending,
not a `persona` parameter on the `task` tool call.

### 1.6 Config-Level Subagent Control

From `~/.grok/config.toml` and `~/.grok/docs/user-guide/15-subagents.md`:

```toml
[subagents]
enabled = true
default_model = "grok-build"   # forces all subagents to this model

[subagents.toggle]
explore = true
plan = false                   # disable specific types

[subagents.models]
explore = "grok-build"         # per-type model routing
```

---

## 2. OMO Concept Mapping

This table maps OMO delegation primitives to their Grok-native equivalents.

| OMO Concept | OMO Mechanism | Grok-Native Equivalent | Status |
| --- | --- | --- | --- |
| `task(subagent_type=...)` | Spawn a category-typed sub-agent | `task` tool with `subagent_type` parameter | **Confirmed local** |
| `call_omo_agent(agent_name=...)` | Spawn a named agent by registry entry | `task` tool with custom role via `.grok/roles/*.toml` | **Confirmed local** |
| Category routing (`quick`, `deep`, `ultrabrain`) | Maps category to model + reasoning level | `[subagents.models]` + `reasoning_effort` in role definition | **Confirmed local** |
| `run_in_background=true` | Async parallel spawn | `task` tool returns `task_id`; parent continues; `get_command_or_subagent_output` polls | **Confirmed local** |
| `session_id` continuation | Resume sub-agent with prior context | `resume_from: <subagent_id>` parameter on `task` tool | **Confirmed local** |
| `fork_context` | Child inherits parent conversation | `fork_context: true` parameter on `task` tool | **Confirmed local** |
| `load_skills=[...]` | Inject skill instructions into sub-agent | Prepend skill/persona instructions to prompt text | **Confirmed local** |
| Parallel wave execution | Multiple sub-agents in same response | Multiple `task` tool calls; collect `task_id`s; poll all | **Confirmed local** |
| Dependency-aware fan-out | Block child B until child A completes | Sequential `task` calls with `resume_from` chaining | **Confirmed local** |
| Lead synthesis | Orchestrator collects and synthesizes outputs | Parent reads `summary_file` outputs from each child | **Confirmed local** |
| Worktree isolation | Sub-agent works in isolated branch | `worktree` mode on `task` tool; merge via `x.ai/git/worktree/apply` | **Confirmed local** |
| Blocked tools | Restrict sub-agent tool access | `capability_mode` on role definition | **Confirmed local** |
| Agent model override | Force specific model per agent | `model` field in role `.toml` or `[subagents.models]` config | **Confirmed local** |

### Gaps and Unknowns

| OMO Concept | Status | Notes |
| --- | --- | --- |
| Named agent registry (Sisyphus, Prometheus, etc.) | **UNKNOWN** | Grok has custom roles but no built-in named OMO agents. Must be implemented as `.grok/roles/*.toml` files. |
| `call_omo_agent` exact API | **NOT APPLICABLE** | OMO-specific. Grok equivalent is `task` tool with custom role. |
| Official xAI API documentation for `task` tool | **UNVERIFIED** | Local bundled docs confirm behavior; official public xAI docs not checked. Do not claim official API stability without checking `https://docs.x.ai`. |
| Grok Build sub-agent spawning in plugin context | **UNVERIFIED** | Confirmed in TUI/headless mode. Behavior inside a Grok plugin (lfg) has not been manually verified. |
| Parallel spawn quota limits | **UNKNOWN** | Depth limits exist; per-session parallel spawn limits not documented locally. |
| Sub-agent spawning in `grok agent stdio` mode | **UNKNOWN** | ACP mode is documented but whether `task` tool is available in stdio mode is not confirmed. |

---

## 3. Fallback Behavior for Dependency-Free Smoke Tests

Smoke tests must not require real Grok credentials or a live Grok session. The following
fallback strategy applies:

### 3.1 Detection Pattern

```python
# In lfg.py and smoke tests
GROK_SPAWN_AVAILABLE = "spawn_subagent" in globals() or _grok_task_tool_available()
```

The existing `lfg.py` already uses this pattern:
```python
default_team_providers = "grok,grok,grok" if "spawn_subagent" in globals() else "hermes,claude,codex"
```

### 3.2 Smoke Test Fallback Contract

| Condition | Behavior |
| --- | --- |
| `GROK_SPAWN_AVAILABLE = True` | Use real `task` tool; assert `task_id` returned |
| `GROK_SPAWN_AVAILABLE = False` | Use `noop` provider; assert fallback path taken; do not fail |

Smoke tests must:
1. Assert the spawn adapter detects availability correctly.
2. Assert the fallback path produces a valid result envelope (status, evidence, touched files).
3. Never assert real Grok session IDs or network responses.

### 3.3 Noop Provider Contract

The `noop` provider must return a result envelope matching the real spawn adapter's schema:

```json
{
  "status": "completed",
  "provider": "noop",
  "task_id": "noop-<uuid>",
  "evidence": "noop execution: <task description>",
  "touched_files": [],
  "blockers": []
}
```

---

## 4. Verification Commands and Manual Gates

### 4.1 Dependency-Free Smoke (no credentials required)

```sh
python3 -m unittest tests.smoke.test_grok_build_runtime -v
```

Expected evidence string: `grok-spawn-adapter-noop=ok`

Pass criteria: spawn adapter initializes, detects noop provider, returns valid envelope.
Fail criteria: import error, missing fallback path, or schema mismatch.

### 4.2 Local Grok Install Smoke

```sh
plugins/lfg/bin/grok-install-smoke.sh
```

Expected evidence string: `grok-installed-mcp-surface=ok`

Pass criteria: `~/.grok/bin/grok` exists, version string returned, `--no-subagents` flag
recognized.
Fail criteria: binary not found, version command fails.

### 4.3 Manual Gate: Real Grok Sub-Agent Spawn

This gate requires an active Grok session and cannot be automated in CI.

Procedure:
1. Open Grok Build TUI.
2. Install `lfg` plugin from marketplace.
3. Run: `/spawn sisyphus-junior --category quick --task "echo hello"`
4. Observe: Grok spawns a child session via `task` tool.
5. Observe: child session returns output to parent.
6. Record: `task_id` returned, child session ID, output summary.

Pass criteria: child session spawned, `task_id` non-empty, output received by parent.
Fail criteria: `task` tool not available, spawn rejected, no child session created.

Evidence string to record: `grok-native-spawn-manual=ok`

**Status: NOT YET VERIFIED.** This gate has not been run. Do not claim `grok-native-spawn-manual=ok`
without running the procedure above and recording the output.

### 4.4 Manual Gate: Custom Role Spawn

Procedure:
1. Create `.grok/roles/sisyphus-junior.toml` with OMO category mapping.
2. Run: `grok --agent sisyphus-junior -p "execute quick task: list files"`
3. Observe: agent uses role definition, applies capability mode and model.

Pass criteria: role loaded, model applied, capability mode respected.
Fail criteria: role file not discovered, model override ignored.

Evidence string to record: `grok-custom-role-spawn-manual=ok`

**Status: NOT YET VERIFIED.**

---

## 5. Implementation Implications for lfg Spawn Adapter

Based on confirmed local evidence, the spawn adapter in `plugins/lfg/bin/lfg.py` must:

1. **Use `task` tool as the primary spawn mechanism.** Not `spawn_subagent` (legacy name
   seen in `lfg.py` globals check). The confirmed tool name from bundled docs is `task`.

2. **Inject persona/role instructions via prompt prepending.** The `persona` parameter is
   NOT supported on the `task` tool call. Instructions must be prepended to the `prompt`
   text.

3. **Map OMO categories to Grok role definitions.** Each OMO category (`quick`, `deep`,
   `ultrabrain`, `artistry`, `unspecified-low`, `unspecified-high`) must have a
   corresponding `.grok/roles/<category>.toml` with `reasoning_effort` and `model` fields.

4. **Store `task_id` (subagent_id) for `resume_from` chaining.** Multi-round workflows
   (Prometheus plan -> Atlas execute, design write -> review -> revise) depend on
   `resume_from` to preserve sub-agent context.

5. **Support `fork_context` for context inheritance.** When a child needs parent history
   (e.g., Sisyphus-Junior receiving full task context), set `fork_context: true`.

6. **Implement noop fallback.** When `task` tool is not available (smoke tests, local dev
   without Grok), return a valid result envelope with `provider: "noop"`.

7. **Respect depth limits.** Do not spawn sub-agents recursively beyond the configured
   depth. Sisyphus-Junior must not spawn further category executors.

8. **Use worktree isolation for file-modifying tasks.** Parallel sub-agents that modify
   files should run in isolated worktrees to prevent conflicts.

### Adapter Interface (Target)

```python
def spawn(agent: str, task: str, category: str = "general-purpose",
          fork_context: bool = False, resume_from: str | None = None,
          capability_mode: str = "all") -> dict:
    """
    Spawn a Grok sub-agent via the task tool.
    Returns: {status, task_id, evidence, touched_files, blockers}
    Falls back to noop if task tool unavailable.
    """

def spawn_wave(agent_tasks: list[dict]) -> list[dict]:
    """
    Spawn multiple sub-agents in parallel.
    Each dict: {agent, task, category, fork_context}
    Returns list of result envelopes.
    """

def synthesize(outputs: list[dict]) -> str:
    """
    Collect and synthesize outputs from a completed wave.
    """
```

---

## 6. Evidence Provenance

| Evidence Item | Source | Verified |
| --- | --- | --- |
| `task` tool parameters | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| Built-in agent types | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| Built-in personas | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| Capability modes | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| `fork_context`, `resume_from` | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| Role `.toml` format | `~/.grok/bundled/roles/explore.toml`, `plan.toml` | Yes (local bundled files) |
| Persona `.toml` format | `~/.grok/bundled/personas/implementer.toml`, `researcher.toml` | Yes (local bundled files) |
| `task` tool in production use | `~/.grok/bundled/skills/design/SKILL.md` | Yes (local bundled skill) |
| `persona` param NOT supported | `~/.grok/bundled/skills/design/SKILL.md` | Yes (explicit warning in skill) |
| Config-level subagent control | `~/.grok/docs/user-guide/15-subagents.md` | Yes (local bundled docs) |
| `--no-subagents` CLI flag | `docs/evidence/cli-surface.md` | Yes (captured 2026-05-18) |
| Grok version | `docs/evidence/cli-surface.md` | Yes: `0.1.211 (2f2cd6d5c2)` |
| Official xAI public API docs | Not checked | **NOT VERIFIED** |
| Real spawn in plugin context | Not tested | **NOT VERIFIED** |
| Parallel spawn quota | Not documented locally | **UNKNOWN** |

---

## 7. Open Questions

1. Is the `task` tool available inside a Grok plugin context (i.e., when `lfg` is installed
   and a skill is running)? The bundled docs confirm it for TUI/headless; plugin context
   is unverified.

2. What are the parallel spawn limits per session? Depth limits are mentioned but per-session
   concurrency limits are not documented locally.

3. Is `grok agent stdio` (ACP mode) able to use the `task` tool? ACP mode is documented
   but sub-agent availability in that mode is not confirmed.

4. Does the official xAI public API (`https://docs.x.ai`) document the `task` tool with
   the same parameters as the local bundled docs? This must be verified before claiming
   official API stability.

5. Which Grok Build version introduced stable sub-agent spawning? The local version is
   `0.1.211`; the minimum required version for the spawn adapter is unknown.

---

## 8. Next Steps (M1 Completion Criteria)

- [ ] Run manual gate 4.3 (real Grok sub-agent spawn) and record `grok-native-spawn-manual=ok`.
- [ ] Run manual gate 4.4 (custom role spawn) and record `grok-custom-role-spawn-manual=ok`.
- [ ] Add `grok-spawn-adapter-noop=ok` to smoke test matrix in `tests/smoke/test_grok_build_runtime.py`.
- [ ] Implement `.grok/roles/` files for each OMO category.
- [ ] Verify `task` tool availability inside plugin context.
- [ ] Check official xAI docs for `task` tool API stability.
- [ ] Update `ROADMAP.md` M1 checkboxes when manual gates pass.
