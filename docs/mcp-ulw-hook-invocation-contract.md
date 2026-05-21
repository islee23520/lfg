# LFG-MCP + ULW Hook Invocation Contract

**Owner**: mcp-ulw-bridge (OMO Hook Parity Team)
**Status**: Defined + Gaps Closed (2026-05-21)
**Target Evidence**: hook-mcp-ulw-contract=ok, lfg-hook-mcp-ulw-parity=ok

## Overview

This document defines the exact invocation contract for LFG's OMO-style hooks when the runtime entrypoint is:

- `bin/lfg-mcp.py` (MCP stdio JSON-RPC server for Grok tool calls)
- `bin/ulw` (ultrawork / ultragoal swarm launcher)
- `bin/lfg` (default)

Hooks must remain fail-open, respect stdin/stdout contracts, propagate environment, and integrate with dispatch_gate for continuation.

## Hook Registration Surface

- Primary: `plugins/lfg/hooks/hooks.json` (used by host Grok/Claude for event wiring)
- Global bridge: `~/.grok/hooks/lfg-audit-bridge.json` + `lfg-audit-bridge.py` (installed via `lfg hook-bridge install` or `scripts/hook-bridge-install.py`)
- Critical events always route to `scripts/lfg-goal-harness.py` (or direct `src/hooks/goal_harness.py` in global bridge)

## Invocation Paths

### 1. Via lfg-mcp.py / MCP Tools
- `bin/lfg-mcp.py` loads `src/mcp/server.py`
- MCP server reads line-delimited JSON-RPC from stdin, writes JSON-RPC to stdout via `respond()` in `_helpers.py`
- Hook-related MCP tools:
  - `grok_build_hook_bridge` (status/install) → calls `lfg hook-bridge` via subprocess (see `_handlers_observation.py:handle_hook_bridge`)
  - Other tools may indirectly trigger hooks via `run_lfg_json` which execs `bin/lfg --json ...`
- **Contract**: MCP stdout MUST remain pure JSON-RPC. No hook code may print to stdout when imported in MCP process. Diagnostics go to stderr or result JSON. Subprocess calls capture stdout/stderr.

### 2. Via bin/ulw
- `bin/ulw` sets:
  - `export LFG_LAUNCHER="ulw"`
  - `export GROK_PLUGIN_DATA="${GROK_PLUGIN_DATA:-$PWD/.lfg}"`
  - `export GROK_PLUGIN_ROOT=...`
- Then execs `python3 .../lfg.py "$@"`
- ULW identity is injected into prompts and agent behavior (see `cli.py:effective_launcher()`, ULW worker prompts)
- Hooks fired by host during ULW session inherit the session env (including LFG_LAUNCHER if set at host level)

### 3. Hook Script Execution (Thin Router + Harness)
- `hooks/scripts/lfg-goal-harness.py`:
  - Resolves plugin root via `GROK_PLUGIN_ROOT` or `CLAUDE_PLUGIN_ROOT` or parent dir
  - Dynamically loads `src/hooks/goal_harness.py`
  - Calls `module.main()`
- `src/hooks/goal_harness.py:main()`:
  - `event = os.environ.get("GROK_HOOK_EVENT", os.environ.get("CLAUDE_HOOK_EVENT", "unknown"))`
  - `raw_payload = sys.stdin.read() if not sys.stdin.isatty() else ""`
  - `sys.stdin = io.StringIO(raw_payload)`  # reset for safety / re-read compatibility
  - Builds snapshot, injection, calls `reserve_continuation_dispatch`
  - `print(injection)` + `print()`  # stdout = prompt injection contract
  - Writes meta to artifacts via `write_injection_artifacts`
  - Returns 0 (fail-open)

## Environment Variables (Contract)

Required / Propagated:
- `GROK_PLUGIN_ROOT` — plugin root (set by wrappers and bridges)
- `GROK_PLUGIN_DATA` — `.lfg` state dir (defaults to cwd/.lfg)
- `GROK_HOOK_EVENT` or `CLAUDE_HOOK_EVENT` — event type (UserPromptSubmit, PostToolUse, etc.)
- `LFG_LAUNCHER` — "lfg" | "ulw" | "mcp" (now defaulted in harness + bridge envs)
- `GROK_SESSION_ID` / `OPENCODE_SESSION_ID` / `CLAUDE_SESSION_ID` — for dispatch key

Optional for dispatch:
- `LFG_NATIVE_DISPATCH_SUPPORTED` — if set to "false", forces manual gate

## stdin / stdout Contract (Strict)

- **stdin**: Hook receives JSON or text payload from host on stdin (binary safe in bridge, text in harness). Harness resets stdin to StringIO after read to prevent downstream issues.
- **stdout**: 
  - Harness: first print = injection text (injected into prompt by host). Extra prints must be avoided.
  - Bridge (audit): uses `stdout=subprocess.DEVNULL`
  - MCP server: ONLY `print(json.dumps(...))` via `respond()`. Any other print breaks JSON-RPC.
- **stderr**: Safe for diagnostics. Never rely on it for injection.
- **Artifacts**: Meta written to files under `.lfg/events/` or similar (never stdout).

## dispatch_gate Integration

- `src/hooks/dispatch_gate.py:reserve_continuation_dispatch()`:
  - Dynamically imports `src/runtime/dispatch_gate.py`
  - Calls `reserve_dispatch_gate(..., native_dispatch_supported=True, ...)`
  - Passes session_id from env, plan_id, boulder_version, reason=`hook:{event}:...`
  - Returns dict with `manualGateRequired`, `dispatchKey`, `artifactPath`, etc.
- `src/runtime/dispatch_gate.py`:
  - Creates `dispatch-{key}.json` in dispatch_root (under .lfg or configured)
  - Status: "dispatched" (if native) or "manual_gate_required"
  - Duplicate suppression supported.

**Gap Closed**: Previously hardcoded `False` → now `True` for Grok/MCP/ULW contexts (enables native sub-agent dispatch when host supports it).

## Gaps Closed in This Work

- LFG_LAUNCHER now explicitly setdefault'ed in:
  - `src/hooks/bridge_runtime.py` (global bridge generator)
  - `scripts/hook_bridge/install.py` (legacy installer)
  - `src/hooks/goal_harness.py:main()`
- native_dispatch_supported now defaults to True (Grok-native friendly)
- Isolation verified: no stdout leakage paths between MCP and hook modules (dynamic loads only, no top-level imports of hook code in mcp/)

## Usage for Other Members

- When implementing agent-specific hooks or tiers, ensure new injection code respects the print-to-stdout contract and sets LFG_LAUNCHER.
- For boulder/dispatch changes, keep the `stateSnapshot` and `dispatchKey` fields stable.
- Test with: `lfg hook-bridge status`, `ulw ...`, MCP tool calls, and host hook events.

## Evidence Strings

- `hook-mcp-ulw-contract=ok`
- `lfg-hook-mcp-ulw-parity=ok`
- `continuation-gate=ok`
- `dispatch-gate=ok`

This contract is the SSOT for mcp-ulw-bridge parity work. All future hook changes must preserve these stdin/stdout/env/dispatch behaviors.
