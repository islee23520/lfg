# ruff: noqa: E402  # dynamic imports after sys.path bootstrap for spec_from_file_location
from __future__ import annotations

import json  # noqa: E402
import importlib  # noqa: E402
import pathlib  # noqa: E402
import sys  # noqa: E402
from typing import Any, Dict, List


_HOOKS_DIR = pathlib.Path(__file__).resolve().parent
if str(_HOOKS_DIR) not in sys.path:
    sys.path.insert(0, str(_HOOKS_DIR))

_ambiguity_gate = importlib.import_module("ambiguity_gate")
_atlas_dependency_wave = importlib.import_module("atlas_dependency_wave")
_compaction_protection = importlib.import_module("compaction_protection")
_paths = importlib.import_module("paths")
_task_helpers = importlib.import_module("task_helpers")
_todo_continuation = importlib.import_module("todo_continuation")
_ralph_loop = importlib.import_module("ralph_loop")
_stop_continuation_guard = importlib.import_module("stop_continuation_guard")
compute_heuristic_ambiguity = _ambiguity_gate.compute_heuristic_ambiguity
atlas_dependency_wave_reminder = _atlas_dependency_wave.atlas_dependency_wave_reminder
build_compaction_protection_injection = _compaction_protection.build_compaction_protection_injection
injection_file = _paths.injection_file
injection_meta = _paths.injection_meta
task_is_pending = _task_helpers.task_is_pending
todo_continuation_reminder = _todo_continuation.todo_continuation_reminder
ralph_continuation_reminder = _ralph_loop.ralph_continuation_reminder
stop_continuation_guard = _stop_continuation_guard.stop_continuation_guard


def build_aggressive_injection(snapshot: Dict[str, Any], user_prompt: str, event: str) -> str:
    if event.lower() == "precompact":
        return build_compaction_protection_injection(snapshot, event)

    ug = snapshot.get("ultragoal") or {}
    runs = snapshot.get("active_runs", [])

    ug_id = ug.get("id", "none")
    ug_obj = ug.get("objective", "no active ultragoal")

    protection_lines: List[str] = []
    pending_tasks: List[str] = []

    for r in runs[:2]:
        mode = r.get("mode", "?")
        obj = r.get("objective", "")[:120]
        tasks = r.get("tasks", [])
        pending = [t for t in tasks if task_is_pending(t)]
        for t in pending[:3]:
            pending_tasks.append(f"[{mode}] {t.get('title', t.get('id'))}")

        protection_lines.append(f"- {mode.upper()} run {r.get('run_id')}: {obj}")

    if not protection_lines:
        protection_lines.append("- No active separated run detected, but ultragoal ledger is alive.")

    compute_heuristic_ambiguity(user_prompt, snapshot)
    continuation = todo_continuation_reminder(snapshot, event)
    atlas_wave = atlas_dependency_wave_reminder(snapshot, event)
    ralph_cont = ralph_continuation_reminder(snapshot, event)
    stop_guard = stop_continuation_guard(snapshot, event)
    continuation_block = ""
    if continuation:
        continuation_block += f"{continuation}\n\n"
    if atlas_wave:
        continuation_block += f"{atlas_wave}\n\n"
    if ralph_cont:
        continuation_block += f"{ralph_cont}\n\n"
    if stop_guard:
        continuation_block += f"{stop_guard}\n\n"
    agent_id = snapshot.get("current_agent", "sisyphus")
    agent_header = _build_agent_header(agent_id, snapshot)

    injection = f"""{continuation_block}{agent_header}
=== LFG ACTIVE GOAL HARNESS — OMO AGENT PROTOCOL ===
This block is produced by the harness. It is MANDATORY.
Current agent: {agent_id.upper()}


=== BOULDER STATE (Single Source of Truth) ===
You MUST treat the following as your official boulder memory (like boulder.json in real OmO).
You are required to read it at the start of your turn and update it before the turn ends.

Current Boulder:
{{
  "ultragoal_id": "{ug_id}",
  "objective": "{ug_obj}",
  "active_work": [
{chr(10).join(['    ' + line for line in protection_lines]) if protection_lines else '    - No active separated runs'}
  ],
  "pending_next_actions": [
{chr(10).join(['    ' + line for line in pending_tasks]) if pending_tasks else '    - No explicit pending actions'}
  ]
}}

USER INPUT THIS TURN:
{user_prompt[:900] if user_prompt else "(no input)"}

=== OFFICIAL BOULDER (YOU MUST MAINTAIN THIS) ===
This is your single source of truth. You are Sisyphus — you are REQUIRED to keep this boulder accurate and up-to-date every single turn.

Current Boulder (loaded from disk):
{json.dumps(snapshot.get("boulder", {}), ensure_ascii=False, indent=2) if snapshot.get("boulder") else "No boulder file found yet. You must create one now."}

=== SISYPHUS MANDATORY BOULDER PROTOCOL (Direction A) ===

You MUST do the following every turn:

1. Read the boulder above as your living memory.
2. Perform your normal Sisyphus work (intent classification, delegation, specialist consultation, coordination, etc.).
3. **At the very end of your response** (after all reasoning, decisions, and delegation), you MUST output the updated boulder in the exact format below.

The boulder block **must be the last thing you output** in this turn, wrapped exactly like this:

```boulder
{{
  "version": 1,
  "ultragoal_id": "...",
  "last_updated_by": "sisyphus",
  "last_updated_at": "current ISO time",
  "current_objective": "...",
  "status_summary": "...",
  "boulder_position": {{ "progress": 0-100, "phase": "..." }},
  "open_questions": [...],
  "blockers": [...],
  "next_actions": [
    {{
      "id": "NA-xx",
      "owner": "atlas | hephaestus | sisyphus",
      "goal": "high-level goal (not a recipe)",
      "success_criteria": "what must be proven with evidence",
      "status": "pending | in_progress | done"
    }}
  ],
  "recent_evidence": [...],
  "sisyphus_notes": "..."
}}
```

If you do not output a valid ```boulder block at the very end, the boulder is considered not updated this turn. This is non-negotiable under Direction A.

=== MANDATORY MINDSET (Direction A — Sisyphus Protocol) ===
- The boulder only exists because you actively maintain it.
- If you do not update the boulder this turn, the next Sisyphus (future you) will be blind.
- On PreCompact or when context is about to be lost, you must produce a complete, self-contained boulder so the labor can continue.
- Weak summaries and "I think it's fine" are forbidden. Be brutally precise.

=== END SISYPHUS PROTOCOL ===

You are now operating as Sisyphus under LFG harness control.
The protocol above overrides normal "helpful assistant" behavior.
"""

    return injection.strip()


def _build_agent_header(agent_id: str, snapshot: Dict[str, Any]) -> str:
    agent = agent_id.lower()
    if agent == "hephaestus":
        return (
            "=== HEPHAESTUS DEEP WORK PROTOCOL (OMo) ===\n"
            "You are Hephaestus. Autonomous deep specialist. "
            "Receive goals not recipes. Enforce GPT-style model family. "
            "Block cheap/utility overrides. Produce evidence-rich "
            "implementation with verification.\n"
        )
    if agent == "prometheus":
        return (
            "=== PROMETHEUS PLAN-ONLY PROTOCOL (OMo) ===\n"
            "You are Prometheus. Strategic planner only. "
            "Interview, clarify, produce verifiable plan. "
            "Hard-reject any implementation or code changes. "
            "Output plan.md + checklist only.\n"
        )
    if agent == "atlas":
        return (
            "=== ATLAS TODO-WAVE PROTOCOL (OMo) ===\n"
            "You are Atlas. Execute dependency waves from plan. "
            "Update checkboxes with evidence. Verify every step. "
            "Continue until checklist complete. Never skip verification.\n"
        )
    if agent == "sisyphus-junior":
        return (
            "=== SISYPHUS-JUNIOR BOUNDED EXECUTOR PROTOCOL (OMo) ===\n"
            "You are Sisyphus-Junior. Bounded category task executor. "
            "Execute assigned scope only. Verify own changes. "
            "Do not orchestrate or spawn other agents. "
            "Stay within category limits.\n"
        )
    if agent == "sisyphus":
        return (
            "=== SISYPHUS ORCHESTRATOR PROTOCOL (OMo) ===\n"
            "You are Sisyphus. Main orchestrator. "
            "Own intent, delegate to specialists, track Boulder, "
            "enforce verification. Persist progress. Never stop until done.\n"
        )
    return (
        f"=== {agent.upper()} AGENT PROTOCOL (OMo) ===\n"
        f"You are {agent}. Follow role constraints from agent registry. "
        "Enforce teamEligibility and blockedTools.\n"
    )


def write_injection_artifacts(injection: str, meta: Dict[str, Any]) -> None:
    try:
        injection_path = injection_file()
        meta_path = injection_meta()
        injection_path.parent.mkdir(parents=True, exist_ok=True)
        injection_path.write_text(injection + "\n", encoding="utf-8")
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass
