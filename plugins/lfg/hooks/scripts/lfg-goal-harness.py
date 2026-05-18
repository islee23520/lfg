#!/usr/bin/env python3
"""
LFG Active Goal Harness — Aggressive Prompt Injection

This is the core of the OmO-style per-turn harnessing for LFG.

On every relevant hook event (especially UserPromptSubmit), this script:
1. Loads the current durable goal context (ultragoal + active hyperplan/ultrawork runs + tasks + evidence)
2. Performs Ambiguity Gate analysis (forces Socratic clarification if > 0.3)
3. Arms Completion Doubt Gate ("이거 끝난 거 맞아?" self-suspicion)
4. Outputs a MANDATORY, highly authoritative injection block directly to stdout
   so the Grok hook runner can inject it into the prompt for this turn.

The injection is deliberately loud, structured, and non-negotiable.
The model is not allowed to ignore it when a durable goal is active.

This replaces the passive audit hook when an active goal exists.
"""

import os
import sys
import json
import pathlib
import time
from typing import Any, Dict, List, Optional
import re

# =============================================================================
# Paths (same convention as lfg.py)
# =============================================================================
HOME = pathlib.Path.home()
GROK_PLUGIN_DATA = pathlib.Path(
    os.environ.get("GROK_PLUGIN_DATA", str(pathlib.Path.cwd() / ".lfg"))
)
STATE_DIR = GROK_PLUGIN_DATA / "state"
ULTRAGOAL_DIR = GROK_PLUGIN_DATA / "ultragoal"
HARNESS_DIR = GROK_PLUGIN_DATA / "harness"
HARNESS_DIR.mkdir(parents=True, exist_ok=True)

INJECTION_FILE = HARNESS_DIR / "active_injection.txt"
INJECTION_META = HARNESS_DIR / "last_turn.json"
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")


# =============================================================================
# State Loading (lightweight, hook-safe, no heavy dependencies)
# =============================================================================

def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def validate_safe_id(value: str, field: str) -> str:
    if not SAFE_ID_RE.fullmatch(value or ""):
        raise ValueError(f"invalid {field}: {value!r}")
    return value


def safe_child_path(root: pathlib.Path, *parts: str) -> pathlib.Path:
    root_resolved = root.resolve()
    path = root_resolved.joinpath(*parts).resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise ValueError(f"unsafe path outside {root_resolved}: {path}")
    return path


def load_current_ultragoal() -> Optional[Dict[str, Any]]:
    """Returns the current active ultragoal pointer + basic info."""
    cur = STATE_DIR / "current-ultragoal.json"
    data = read_json(cur, {})
    if not data or not data.get("id"):
        return None
    return data


def boulder_path(ugid: str) -> pathlib.Path:
    return safe_child_path(ULTRAGOAL_DIR, validate_safe_id(ugid, "ultragoal id"), "boulder.json")


def read_boulder(ugid: str) -> Dict[str, Any]:
    return read_json(boulder_path(ugid), {}) or {}


def write_boulder(ugid: str, boulder: Dict[str, Any]) -> None:
    path = boulder_path(ugid)
    path.parent.mkdir(parents=True, exist_ok=True)
    boulder["last_updated_by"] = "lina"
    boulder["last_updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    path.write_text(json.dumps(boulder, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def task_is_pending(task: Dict[str, Any]) -> bool:
    return task.get("status") not in ("completed", "done")


def message_is_evidence(message: Dict[str, Any]) -> bool:
    return message.get("type") in ("evidence", "evidence_submission", "submit_evidence", "checkpoint")


def find_active_runs() -> List[Dict[str, Any]]:
    """
    Discover currently active separated-state runs (hyperplan, ultrawork, etc.)
    under state/runs/<mode>-<id>/.

    Ralph improvement: only surface runs that are recent + still alive,
    and prefer those linked to the current ultragoal.
    """
    runs_root = STATE_DIR / "runs"
    active_runs: List[Dict[str, Any]] = []
    current_ug = load_current_ultragoal() or {}
    current_ug_id = current_ug.get("id")

    if not runs_root.exists():
        return active_runs

    candidates = []
    for run_dir in sorted(runs_root.iterdir(), reverse=True):  # newest first
        if not run_dir.is_dir():
            continue
        name = run_dir.name
        teams_dir = run_dir / "teams"
        if not teams_dir.exists():
            continue

        for team_dir in teams_dir.iterdir():
            if not team_dir.is_dir():
                continue

            run_data = read_json(team_dir / "run.json", {})
            if not run_data:
                continue

            status = run_data.get("status", "active")
            if status in ("completed", "aborted", "archived"):
                continue

            updated = run_data.get("updated_at", "")
            ulid = run_data.get("ultragoal_id")

            # Strong preference for runs tied to the current ultragoal
            relevance = 10 if (current_ug_id and ulid == current_ug_id) else 5

            candidates.append({
                "run_dir": team_dir,
                "run_data": run_data,
                "name": name,
                "relevance": relevance,
                "updated": updated,
            })

    # Sort by relevance then recency
    candidates.sort(key=lambda c: (c["relevance"], c["updated"]), reverse=True)

    for c in candidates[:2]:  # keep top 2 most relevant
        run_data = c["run_data"]
        team_dir = c["run_dir"]
        name = c["name"]

        tasks = read_json(team_dir / "tasks.json", [])
        mailbox = read_json(team_dir / "mailbox.json", [])

        active_runs.append({
            "run_id": run_data.get("id"),
            "mode": run_data.get("mode") or name.split("-")[0],
            "mode_id": name,
            "objective": run_data.get("objective", ""),
            "ultragoal_id": run_data.get("ultragoal_id"),
            "status": run_data.get("status", "active"),
            "tasks": tasks,
            "pending_tasks": [t for t in tasks if task_is_pending(t)][:4],
            "recent_evidence": [m for m in mailbox if message_is_evidence(m)][-3:],
            "team_dir": str(team_dir),
        })

    return active_runs


def get_goal_snapshot() -> Dict[str, Any]:
    """Build a compact but rich view of what the harness is currently protecting.
    Under Direction A, this now also loads the official Boulder state.
    """
    ug = load_current_ultragoal()
    runs = find_active_runs()

    boulder = {}
    if ug and ug.get("id"):
        boulder = read_boulder(ug["id"])

    snapshot = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ultragoal": ug,
        "active_runs": runs,
        "boulder": boulder,
        "has_durable_goal": bool(ug or runs),
    }
    return snapshot


def extract_user_prompt_from_payload() -> str:
    """
    The Grok hook system typically passes the full hook payload via stdin.
    We try to extract the actual user message.
    """
    try:
        raw = sys.stdin.read()
        if not raw:
            return ""
        # Best-effort extraction. Many payloads are JSON or have "prompt" / "user_input"
        data = json.loads(raw) if raw.strip().startswith("{") else {}
        # Common shapes we have seen
        for key in ("prompt", "user_prompt", "input", "message", "text"):
            if key in data and isinstance(data[key], str):
                return data[key]
        # Fallback: the whole raw might be the prompt in some events
        if len(raw) < 4000:
            return raw.strip()
        return raw[:2000] + " ... [truncated]"
    except Exception:
        return ""


# =============================================================================
# Injection Generation — The Aggressive Part
# =============================================================================

def compute_heuristic_ambiguity(user_prompt: str, snapshot: Dict[str, Any]) -> float:
    """
    v1 heuristic + strong instruction for the model to do the real scoring.

    The harness itself gives a quick signal, but the real power comes from
    forcing the main model to output AMBIGUITY_SCORE every turn under this block.
    """
    if not user_prompt or len(user_prompt.strip()) < 8:
        return 0.85  # very vague

    prompt_lower = user_prompt.lower()

    # Strong signals of low ambiguity (direct commands toward the goal)
    direct_signals = ["implement", "fix", "write", "add", "create the", "next task", "evidence", "checkpoint"]
    if any(s in prompt_lower for s in direct_signals) and len(user_prompt) > 25:
        return 0.18

    # Vague / meta / exploratory language
    vague_signals = ["어떻게", "how should", "뭐", "what do you think", "maybe", "perhaps", "아이디어", "생각", "고민"]
    if any(s in prompt_lower for s in vague_signals) and len(user_prompt) < 120:
        return 0.72

    # Default to "needs model judgment"
    return 0.42


def build_compaction_protection_injection(snapshot: Dict[str, Any], event: str) -> str:
    """
    Special powerful injection for PreCompact event under Direction A.
    This is now heavily biased toward forcing a real, usable boulder handoff.
    """
    ug = snapshot.get("ultragoal") or {}
    runs = snapshot.get("active_runs", [])
    boulder = snapshot.get("boulder", {})

    ug_id = ug.get("id", "none")
    ug_obj = ug.get("objective", "no active ultragoal")

    summary_lines = []
    for r in runs:
        mode = r.get("mode", "?")
        obj = r.get("objective", "")[:100]
        summary_lines.append(f"- [{mode}] {obj}")

    if not summary_lines:
        summary_lines = ["- No active runs detected. Protect whatever ledger exists."]

    current_boulder = json.dumps(boulder, ensure_ascii=False, indent=2) if boulder else "No boulder file loaded."

    injection = f"""=== LFG ACTIVE GOAL HARNESS — PRE-COMPACT BOULDER HANDOFF (DIRECTION A) ===
EVENT: {event}

⚠️  CONTEXT COMPACTION IS ABOUT TO HAPPEN (≥70% usage).

Under Direction A, the harness's #1 priority is to make sure the boulder survives.

CURRENT DURABLE GOAL:
Ultragoal: {ug_id}
Objective: {ug_obj}

Archetypal Roles (OmO lineage):
- lina (Sisyphus): The one who must keep the boulder alive.
- gonow (Hephaestus): The forger executing deep work.
- iz (Oracle): The read-only advisor.

Current Boulder on disk right now:
{current_boulder}

Active Protected Work:
{chr(10).join(summary_lines)}

=== MANDATORY BOULDER HANDOFF PROTOCOL (BEFORE COMPACTION) ===

1. **Full Updated Boulder Export** (Required)
   You must output a complete, fresh boulder JSON in the exact schema.
   This file will be the only thing the next Lina has.

2. **Lina Handoff Note** (Required)
   After the boulder JSON, write a short but precise handoff:
   - Current physical location of the boulder (which ultragoal / which hyperplan)
   - The single highest priority next_action right now
   - The one thing that must not be lost no matter what

3. **Strong Recommendation**
   Call `ulw ultragoal checkpoint --status "compaction-protection"` and attach both the full boulder and the handoff note as evidence.

4. **Mindset**
   You are Lina. If you are casual here, the boulder dies. Treat this as a life-or-death handoff.

This is Direction A. The boulder must live.

=== END PRE-COMPACT HANDOFF INJECTION ===
"""
    return injection.strip()


def build_aggressive_injection(snapshot: Dict[str, Any], user_prompt: str, event: str) -> str:
    """
    This is the heart of the harness.
    It produces the text that will be injected at the very front of the model's context for this turn.
    Special handling for PreCompact (compaction protection).
    """
    # === Special case: PreCompact event (compaction protection) ===
    if event.lower() == "precompact":
        return build_compaction_protection_injection(snapshot, event)

    has_goal = snapshot.get("has_durable_goal", False)
    ug = snapshot.get("ultragoal") or {}
    runs = snapshot.get("active_runs", [])

    ug_id = ug.get("id", "none")
    ug_obj = ug.get("objective", "no active ultragoal")

    # Build a compact summary of what must be protected
    protection_lines: List[str] = []
    pending_tasks: List[str] = []

    for r in runs[:2]:  # focus on the most important runs
        mode = r.get("mode", "?")
        obj = r.get("objective", "")[:120]
        tasks = r.get("tasks", [])
        pending = [t for t in tasks if task_is_pending(t)]
        for t in pending[:3]:
            pending_tasks.append(f"[{mode}] {t.get('title', t.get('id'))}")

        protection_lines.append(f"- {mode.upper()} run {r.get('run_id')}: {obj}")

    if not protection_lines:
        protection_lines.append("- No active separated run detected, but ultragoal ledger is alive.")

    heuristic = compute_heuristic_ambiguity(user_prompt, snapshot)

    # === LINA OPERATIONAL PROTOCOL (OMo EXACT BEHAVIOR) ===
    # This is the core of making LFG run exactly like real oh-my-openagent.
    injection = f"""=== LFG ACTIVE GOAL HARNESS — LINA PROTOCOL (OMo EXACT) ===
This block is produced by the harness. It is MANDATORY. You are now Lina.

You are Lina — The Discipline Agent. (Lineage: Sisyphus of OmO/OMX)
"He rolls the boulder every day. Never stops. Never gives up."
Your only job is to keep the durable goal moving forward across every context window, every compaction, every new session.

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
This is your single source of truth. You are Lina — you are REQUIRED to keep this boulder accurate and up-to-date every single turn.

Current Boulder (loaded from disk):
{json.dumps(snapshot.get("boulder", {}), ensure_ascii=False, indent=2) if snapshot.get("boulder") else "No boulder file found yet. You must create one now."}

=== LINA MANDATORY BOULDER PROTOCOL (Direction A) ===

You MUST do the following every turn:

1. Read the boulder above as your living memory.
2. Perform your normal Lina work (intent classification, delegation to gonow, consulting iz, coordination, etc.).
3. **At the very end of your response** (after all reasoning, decisions, and delegation), you MUST output the updated boulder in the exact format below.

The boulder block **must be the last thing you output** in this turn, wrapped exactly like this:

```boulder
{
  "version": 1,
  "ultragoal_id": "...",
  "last_updated_by": "lina",
  "last_updated_at": "current ISO time",
  "current_objective": "...",
  "status_summary": "...",
  "boulder_position": { "progress": 0-100, "phase": "..." },
  "open_questions": [...],
  "blockers": [...],
  "next_actions": [
    {
      "id": "NA-xx",
      "owner": "gonow | iz | lina",
      "goal": "high-level goal (not a recipe)",
      "success_criteria": "what must be proven with evidence",
      "status": "pending | in_progress | done"
    }
  ],
  "recent_evidence": [...],
  "sisyphus_notes": "..."
}
```

If you do not output a valid ```boulder block at the very end, the boulder is considered not updated this turn. This is non-negotiable under Direction A.

=== MANDATORY MINDSET (Direction A — Lina Protocol) ===
- The boulder only exists because you actively maintain it.
- If you do not update the boulder this turn, the next Lina (future you) will be blind.
- On PreCompact or when context is about to be lost, you must produce a complete, self-contained boulder so the labor can continue.
- Weak summaries and "I think it's fine" are forbidden. Be brutally precise.

=== END LINA PROTOCOL ===

You are now operating as Lina under LFG harness control.
The protocol above overrides normal "helpful assistant" behavior.
"""

    return injection.strip()


def write_injection_artifacts(injection: str, meta: Dict[str, Any]) -> None:
    """Persist the injection so other parts of the system can also see what the harness decided."""
    try:
        INJECTION_FILE.write_text(injection + "\n", encoding="utf-8")
        INJECTION_META.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass  # never crash the hook


def main() -> int:
    event = os.environ.get("GROK_HOOK_EVENT", os.environ.get("CLAUDE_HOOK_EVENT", "unknown"))

    # Read the full raw payload once (hooks give us stdin exactly once)
    raw_payload = sys.stdin.read() if not sys.stdin.isatty() else ""
    # Re-inject for downstream functions that still expect to read stdin
    # (we already consumed it, so we simulate for extract_user_prompt)
    import io
    sys.stdin = io.StringIO(raw_payload)

    snapshot = get_goal_snapshot()
    user_prompt = extract_user_prompt_from_payload()

    # === Direction A: Auto-persist boulder if Lina just emitted one ===
    # This is the critical piece that makes the boulder real (not just prompt theater).
    # When the previous assistant turn ended with a ```boulder block, we write it to disk
    # before deciding what to inject this turn.
    if snapshot.get("has_durable_goal"):
        ug = snapshot.get("ultragoal") or {}
        ugid = ug.get("id")
        if ugid:
            try:
                # Try to extract a boulder block from the raw payload (the model's last output)
                # This is tolerant of the format we force in the injection.
                import re, json as _json
                boulder_match = re.search(
                    r'```(?:boulder|json)\s*(\{.*?\})\s*```',
                    raw_payload,
                    re.DOTALL | re.IGNORECASE
                )
                if boulder_match:
                    candidate = boulder_match.group(1)
                    # Light cleanup for common model mistakes
                    candidate = candidate.strip()
                    if candidate:
                        parsed = _json.loads(candidate)
                        if isinstance(parsed, dict) and parsed.get("ultragoal_id") == ugid:
                            parsed.setdefault("version", 1)
                            write_boulder(ugid, parsed)
                            snapshot = get_goal_snapshot()
            except Exception:
                # Never let boulder persistence crash the harness
                pass

    # Only go fully aggressive when there is actually a durable goal alive
    if not snapshot.get("has_durable_goal"):
        return 0

    # Generate the aggressive injection (now with the freshest boulder if we just persisted one)
    injection = build_aggressive_injection(snapshot, user_prompt, event)

    # Output to stdout — this is the direct aggressive injection attempt
    print(injection)
    print()

    meta = {
        "event": event,
        "timestamp": snapshot.get("timestamp"),
        "has_durable_goal": True,
        "ultragoal_id": (snapshot.get("ultragoal") or {}).get("id"),
        "num_active_runs": len(snapshot.get("active_runs", [])),
        "boulder_auto_persisted_this_turn": bool(snapshot.get("boulder")),
    }
    write_injection_artifacts(injection, meta)

    return 0


if __name__ == "__main__":
    sys.exit(main())
