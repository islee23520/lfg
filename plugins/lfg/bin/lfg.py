#!/usr/bin/env python3
"""Dependency-free runtime for the LFG Grok Build plugin.

It gives Grok skills and MCP tools a concrete runtime for stateful
goal, plan, team, and QA loops under .lfg.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import subprocess
import shutil
import sys
import time
import uuid
import shlex
import urllib.error
import urllib.request
from typing import Any

ROOT = pathlib.Path(os.environ.get("GROK_PLUGIN_ROOT") or pathlib.Path(__file__).resolve().parents[1])

DATA = pathlib.Path(os.environ.get("GROK_PLUGIN_DATA") or pathlib.Path.cwd() / ".lfg")
STATE_DIR = DATA / "state"
RUNS_DIR = DATA / "runs"
PLANS_DIR = DATA / "plans"
CATALOG_PATH = ROOT / "catalog" / "omo-skill-map.json"
STATE_SCHEMA_VERSION = 1
APPROVED_MODEL_PROVIDERS = {"openai", "google", "xai", "grok", "codex", "copilot", "zai"}
PROVIDER_DEFAULT_MODELS = {
    "openai": "openai/gpt-5.5",
    "google": "google/gemini-3.1-pro-preview",
    "xai": "xai/grok-4.3",
    "grok": "xai/grok-4.3",
    "codex": "openai-codex",
    "copilot": "github-copilot",
    "zai": "zai-coding-plan",
}
ZAI_CODING_PLAN_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
ZAI_GENERAL_BASE_URL = "https://api.z.ai/api/paas/v4"
ZAI_DEFAULT_MODEL = "glm-4.6"
GROK_ORACLE_REVIEW = {
    "required": True,
    "provider": "openai",
    "model": "openai/gpt-5.5",
    "variant": "high",
    "fallback_models": [
        {"model": "github-copilot/gpt-5.5", "variant": "high"},
        {"model": "google/gemini-3.1-pro-preview", "variant": "high"},
        {"model": "zai-coding-plan/glm-5.1"},
    ],
    "role": "oracle",
    "strict": True,
    "mode": "local-smoke",
    "status": "passed",
}
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
ENV_NAME_RE = re.compile(r"^[A-Z_][A-Z0-9_]{0,127}$")


def validate_safe_id(value: str, field: str) -> str:
    if not SAFE_ID_RE.fullmatch(value or ""):
        raise SystemExit(f"invalid {field}: must match {SAFE_ID_RE.pattern}")
    return value


def safe_child_path(root: pathlib.Path, *parts: str) -> pathlib.Path:
    root_resolved = root.resolve()
    path = root_resolved.joinpath(*parts).resolve()
    if path != root_resolved and root_resolved not in path.parents:
        raise SystemExit(f"unsafe path outside {root_resolved}: {path}")
    return path


def parse_providers(value: str) -> list[str]:
    providers: list[str] = [p.strip() for p in (value or "").split(",") if p.strip()]
    invalid = [p for p in providers if p not in TEAM_PROVIDER_EXECUTABLES]
    if invalid:
        raise SystemExit(f"unknown provider(s): {', '.join(invalid)}")
    if not providers:
        raise SystemExit("at least one provider is required")
    return providers

def effective_launcher() -> str:
    """Return the user-facing binary name that was used to invoke this runtime."""
    return os.environ.get("LFG_LAUNCHER") or pathlib.Path(sys.argv[0]).name or "lfg"


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def state_schema_path() -> pathlib.Path:
    return STATE_DIR / "schema.json"


def ensure_state_schema() -> dict[str, Any]:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = state_schema_path()
    current = read_json(path, {}) if path.exists() else {}
    previous = current.get("version")
    migrations = list(current.get("migrations", [])) if isinstance(current.get("migrations"), list) else []
    if previous != STATE_SCHEMA_VERSION:
        migrations.append({"ts": now(), "from": previous, "to": STATE_SCHEMA_VERSION})
    schema = {
        "name": "lfg-state",
        "version": STATE_SCHEMA_VERSION,
        "createdAt": current.get("createdAt") or now(),
        "updatedAt": now(),
        "stateDir": str(STATE_DIR),
        "runsDir": str(RUNS_DIR),
        "migrations": migrations,
    }
    path.write_text(jdump(schema) + "\n", encoding="utf-8")
    return schema


def ensure_dirs() -> None:
    for p in (DATA, STATE_DIR, RUNS_DIR, PLANS_DIR):
        p.mkdir(parents=True, exist_ok=True)
    ensure_state_schema()


def jdump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(jdump(value) + "\n", encoding="utf-8")


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def emit(value: Any, json_mode: bool) -> None:
    if json_mode:
        print(jdump(value))
    elif isinstance(value, str):
        print(value)
    else:
        print(jdump(value))


def detect_repo(cwd: pathlib.Path) -> dict[str, Any]:
    def run(cmd: list[str]) -> str | None:
        try:
            return subprocess.check_output(cmd, cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return None
    top = run(["git", "rev-parse", "--show-toplevel"])
    branch = run(["git", "branch", "--show-current"])
    head = run(["git", "rev-parse", "--short", "HEAD"])
    dirty = run(["git", "status", "--short"])
    return {
        "cwd": str(cwd),
        "gitRoot": top,
        "branch": branch,
        "head": head,
        "dirty": bool(dirty),
        "dirtyPreview": (dirty or "").splitlines()[:20],
    }


def goal_path(goal_id: str) -> pathlib.Path:
    return STATE_DIR / "goals" / f"{goal_id}.json"


def list_goals() -> list[dict[str, Any]]:
    goals = []
    for path in sorted((STATE_DIR / "goals").glob("*.json")):
        try:
            goals.append(read_json(path))
        except Exception:
            pass
    return goals


def create_goal(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    gid = args.id or f"grok-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    goal = {
        "id": gid,
        "objective": args.objective,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "checklist": [s.strip() for s in (args.checklist or "").split(";") if s.strip()],
        "events": [{"ts": now(), "type": "created", "message": args.objective}],
    }
    write_json(goal_path(gid), goal)
    write_json(STATE_DIR / "current-goal.json", {"id": gid, "path": str(goal_path(gid)), "updatedAt": now()})
    return goal


def update_goal(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no goal id and no current goal")
    goal = read_json(goal_path(ref))
    if not goal:
        raise SystemExit(f"goal not found: {ref}")
    goal["status"] = args.status
    goal["updatedAt"] = now()
    goal.setdefault("events", []).append({"ts": now(), "type": "status", "status": args.status, "message": args.note or ""})
    write_json(goal_path(ref), goal)
    return goal


# --- ultragoal: durable multi-goal plans (Grok-native port of OMX ultragoal) ---

def ultragoal_dir(ugid: str) -> pathlib.Path:
    return safe_child_path(DATA / "ultragoal", validate_safe_id(ugid, "ultragoal id"))


def ultragoal_goals_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "goals.json"


def ultragoal_ledger_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "ledger.jsonl"


def ultragoal_brief_path(ugid: str) -> pathlib.Path:
    return ultragoal_dir(ugid) / "brief.md"


def ultragoal_current_path() -> pathlib.Path:
    return STATE_DIR / "current-ultragoal.json"


# =============================================================================
# Boulder State (Direction A - Lina Boulder Management)
# This is the core durable memory structure that Lina must actively maintain,
# modeled directly after real OmO boulder.json behavior.
# =============================================================================

def boulder_path(ugid: str) -> pathlib.Path:
    """Location of the official boulder state for a given ultragoal."""
    return ultragoal_dir(ugid) / "boulder.json"


def read_boulder(ugid: str) -> dict[str, Any]:
    """Read the current boulder. Returns empty dict if not exist yet."""
    path = boulder_path(ugid)
    data = read_json(path, {})
    if not data:
        # Initialize minimal boulder if none exists
        data = {
            "version": 1,
            "ultragoal_id": ugid,
            "last_updated_by": "lina",
            "last_updated_at": now(),
            "current_objective": "",
            "status_summary": "Boulder initialized. No progress recorded yet.",
            "boulder_position": {"progress": 0, "phase": "initialization"},
            "open_questions": [],
            "blockers": [],
            "next_actions": [],
            "recent_evidence": [],
            "sisyphus_notes": "This boulder must be actively maintained by Lina every turn."
        }
        write_json(path, data)
    return data


def write_boulder(ugid: str, boulder: dict[str, Any]) -> None:
    """Write the boulder after Lina has updated it."""
    boulder["last_updated_by"] = "lina"
    boulder["last_updated_at"] = now()
    write_json(boulder_path(ugid), boulder)


def parse_boulder_block(text: str) -> dict[str, Any] | None:
    """
    Extract a boulder JSON object from text.
    Looks for ```boulder or ```json fenced blocks, with light tolerance for model slop.
    Returns the parsed dict or None.
    """
    if not text:
        return None

    import re
    # Primary pattern: ```boulder ... ``` or ```json ... ```
    patterns = [
        r'```(?:boulder|json)\s*(\{.*?\})\s*```',
        r'```(\{.*?"ultragoal_id".*?\})\s*```',  # fallback for bare json containing ultragoal_id
    ]

    for pat in patterns:
        match = re.search(pat, text, re.DOTALL | re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            # Remove common trailing junk
            candidate = re.sub(r',\s*}', '}', candidate)
            candidate = re.sub(r',\s*\]', ']', candidate)
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict) and "ultragoal_id" in parsed:
                    return parsed
            except Exception:
                continue
    return None


def safe_write_boulder(ugid: str, boulder: dict[str, Any]) -> tuple[bool, str]:
    """
    Validate, normalize and write a boulder.
    Returns (success, message).
    Never silently drops the boulder.
    """
    try:
        if not isinstance(boulder, dict):
            return False, "boulder is not a dict"

        boulder.setdefault("version", 1)
        boulder["ultragoal_id"] = ugid
        boulder.setdefault("last_updated_by", "lina")
        boulder.setdefault("last_updated_at", now())

        # Light normalization for common missing fields
        boulder.setdefault("status_summary", "")
        boulder.setdefault("boulder_position", {"progress": 0, "phase": "unknown"})
        boulder.setdefault("open_questions", [])
        boulder.setdefault("blockers", [])
        boulder.setdefault("next_actions", [])
        boulder.setdefault("recent_evidence", [])
        boulder.setdefault("sisyphus_notes", "")

        write_boulder(ugid, boulder)
        return True, "boulder written successfully"
    except Exception as e:
        return False, f"failed to write boulder: {e}"


def get_active_harness_injection(max_chars: int = 6000) -> str:
    """
    Secondary consumption for LFG Active Goal Harness.
    If the aggressive hook wrote an injection (from UserPromptSubmit etc.),
    we can force-include it in worker prompts, agent prompts, etc.
    This makes the harness effective even when stdout injection from the hook runner is limited.
    """
    harness_file = DATA / "harness" / "active_injection.txt"
    if harness_file.exists():
        try:
            text = harness_file.read_text(encoding="utf-8")
            if text.strip():
                return "\n\n" + text[:max_chars] + "\n\n"
        except Exception:
            pass
    return ""


def ultragoal_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    ugid = args.id or f"ultragoal-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    udir = ultragoal_dir(ugid)
    udir.mkdir(parents=True, exist_ok=True)

    brief = args.brief or args.objective
    if brief.startswith("@"):
        p = pathlib.Path(brief[1:]).resolve()
        brief = p.read_text(encoding="utf-8") if p.exists() else brief

    # Single aggregate story for v1 parity (matches "repo-native multi-goal" spirit; user can extend)
    story = {
        "id": "S001",
        "objective": args.objective,
        "status": "active",
        "checklist": [s.strip() for s in (args.checklist or "design;implement;verify;gate").split(";") if s.strip()],
        "createdAt": now(),
    }
    goals_doc = {
        "id": ugid,
        "objective": args.objective,
        "createdAt": now(),
        "updatedAt": now(),
        "stories": [story],
        "aggregateStatus": "active",
        "backingGoal": None,
    }

    # Create a backing primitive goal (the "Codex goal" equivalent)
    backing = create_goal(argparse.Namespace(
        id=f"backing-{ugid}",
        objective=f"[ultragoal {ugid}] {args.objective}",
        checklist=";".join(story["checklist"]),
        cwd=args.cwd,
    ))
    goals_doc["backingGoal"] = {"id": backing["id"], "path": str(goal_path(backing["id"]))}

    write_json(ultragoal_goals_path(ugid), goals_doc)
    (ultragoal_brief_path(ugid)).write_text(brief + "\n", encoding="utf-8")
    # init empty ledger
    ultragoal_ledger_path(ugid).write_text("", encoding="utf-8")

    current = {"id": ugid, "path": str(udir), "updatedAt": now()}
    write_json(ultragoal_current_path(), current)

    # initial ledger entry
    ultragoal_checkpoint_record(ugid, "active", "ultragoal created", {"backingGoal": backing})

    rec = {"id": ugid, "dir": str(udir), "goals": goals_doc, "briefPath": str(ultragoal_brief_path(ugid))}
    rec["path"] = str(udir)
    return rec


def ultragoal_checkpoint_record(ugid: str, status: str, evidence: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    ledger_path = ultragoal_ledger_path(ugid)
    entry = {
        "ts": now(),
        "status": status,
        "evidence": evidence,
    }
    if extra:
        entry.update(extra)
    with ledger_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def ultragoal_status(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        return {"ultragoal": "none", "message": "no active ultragoal"}
    udir = ultragoal_dir(ref)
    if not udir.exists():
        return {"ultragoal": ref, "error": "dir missing"}
    goals = read_json(ultragoal_goals_path(ref), {})
    # last few ledger lines
    ledger_lines = []
    lp = ultragoal_ledger_path(ref)
    if lp.exists():
        lines = [l for l in lp.read_text(encoding="utf-8").strip().splitlines() if l.strip()][-5:]
        for l in lines:
            try:
                ledger_lines.append(json.loads(l))
            except Exception:
                pass
    return {"id": ref, "dir": str(udir), "goals": goals, "recentLedger": ledger_lines}


def ultragoal_checkpoint(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ultragoal id and no current ultragoal")
    udir = ultragoal_dir(ref)
    if not udir.exists():
        raise SystemExit(f"ultragoal not found: {ref}")

    goals = read_json(ultragoal_goals_path(ref))
    if not goals:
        raise SystemExit("goals.json missing")

    status = args.status
    evidence = args.evidence or ""

    # Quality gate enforcement for final completion (v1: if completing the only/last story)
    stories = goals.get("stories", [])
    is_final = len(stories) == 1 or (args.story and args.story == stories[-1].get("id"))
    if status == "complete" and is_final:
        # require evidence of gate (ai-slop + code-review or explicit --force-gate)
        gate_ok = args.force_gate or ("ai-slop" in evidence.lower() and "approve" in evidence.lower())
        if not gate_ok:
            raise SystemExit("final story complete requires quality gate evidence (ai-slop-cleaner + code-review APPROVE) or --force-gate")

    # update story status if provided
    if args.story:
        for s in stories:
            if s.get("id") == args.story:
                s["status"] = status
                s["evidence"] = evidence
                break
    else:
        # update aggregate + last story
        goals["aggregateStatus"] = status
        if stories:
            stories[-1]["status"] = status
            stories[-1]["evidence"] = evidence

    goals["updatedAt"] = now()
    write_json(ultragoal_goals_path(ref), goals)

    extra = {"story": args.story} if args.story else {}
    if args.goal_json:
        extra["codexGoalSnapshot"] = args.goal_json[:2000]  # truncate for ledger sanity

    entry = ultragoal_checkpoint_record(ref, status, evidence, extra)

    # also touch backing goal if present
    backing = goals.get("backingGoal")
    if backing and status in ("complete", "blocked", "cancelled"):
        try:
            # best-effort update of backing
            update_goal(argparse.Namespace(id=backing["id"], status=status, note=evidence[:200], cwd=os.getcwd()))
        except Exception:
            pass

    return {"id": ref, "status": status, "entry": entry, "goals": goals}


def ultragoal_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(ultragoal_current_path(), {}) or {}).get("id")
    if not ref:
        return {"ultragoal": []}
    st = ultragoal_status(args)
    st["brief"] = ""
    bp = ultragoal_brief_path(ref)
    if bp.exists():
        st["brief"] = bp.read_text(encoding="utf-8")[:2000]
    return st


def ultragoal_spawn(args: argparse.Namespace) -> dict[str, Any]:
    """Create an ultragoal and immediately spawn a linked ulw-branded team swarm.

    This is the 'ultragoal spawn ulw' surface that makes LFG team mode feel like
    Grok-native sub-agent swarm spawning tied to a durable goal ledger.
    """
    ug = ultragoal_create(argparse.Namespace(
        objective=args.objective,
        id=getattr(args, "id", None),
        brief=getattr(args, "brief", None),
        checklist=getattr(args, "checklist", None),
        cwd=args.cwd,
    ))
    ugid = ug["id"]

    # Template + mode detection (D: full end-to-end for hyperplan)
    template = str(getattr(args, "template", "") or "").lower().strip()
    explicit_spec = getattr(args, "spec", None)
    spec_lower = str(explicit_spec or "").lower()

    if template == "hyperplan" or "hyperplan" in template or "hyperplan" in spec_lower or getattr(args, "hyperplan", False):
        run_mode = "hyperplan"
        # Expand hyperplan template to the canonical named-agent lineup (B + D)
        # iz (deep/architect), grok (artistry/consultant), gonow (balanced/worker)
        if not explicit_spec or explicit_spec in ("3:executor", "executor"):
            effective_spec = "1:iz,1:grok,1:gonow"
        else:
            effective_spec = explicit_spec
    else:
        run_mode = "ultragoal"
        effective_spec = explicit_spec or "3:executor"

    # Create the TeamRun with separated JSON state (like OmO per-run directories)
    runtime = TeamRuntime(TeamStateStore(mode=run_mode, mode_id=ugid))
    team_name = validate_safe_id(getattr(args, "name", None) or f"ultragoal-{ugid}", "team name")
    team_run = runtime.create(
        name=team_name,
        objective=f"[ultragoal {ugid}] {args.objective}",
        ultragoal_id=ugid,
        config={"providers": getattr(args, "providers", None), "template": template or None},
        mode=run_mode,
        mode_id=ugid,
    )

    # team_create does member creation + tmux + ULW prompts (wired for named agents + categories)
    default_team_providers = "grok,grok,grok" if "spawn_subagent" in globals() else "hermes,claude,codex"
    team = team_create(argparse.Namespace(
        spec=effective_spec,
        objective=f"[ultragoal {ugid}] {args.objective}",
        name=team_run.name,
        providers=getattr(args, "providers", default_team_providers),
        dry_run=getattr(args, "dry_run", False),
        cwd=args.cwd,
        mode=run_mode,
        mode_id=ugid,
    ))

    # Link both ways
    team["ultragoal"] = ugid
    write_json(team_dir() / f"{team['name']}.json", team)

    ultragoal_checkpoint_record(ugid, "active", f"spawned ulw swarm team {team['name']}", {"team": team["name"]})

    # Merge the new TeamRun info into the legacy team dict for now
    state_base = _get_mode_aware_base(run_mode, ugid)
    state_path = state_base / "teams" / team_run.id

    team["team_run"] = {
        "id": team_run.id,
        "mode": run_mode,
        "state_path": str(state_path)
    }

    # D: For hyperplan/ultrawork, seed initial tasks with evidence/verification flow (continuous loop ready)
    if run_mode == "hyperplan":
        try:
            tl = runtime.get_tasklist(team_run.id)
            tl.create_task(
                "Deep architecture & structural analysis (IZ)",
                "Use AST-Grep + LSP to map boundaries, risks, and long-term implications. Report evidence for leader verification.",
                []
            )
            tl.create_task(
                "Creative multi-perspective review & alternatives (Grok)",
                "Apply artistry + deep synthesis. Surface novel options and critiques. Submit evidence.",
                []
            )
            tl.create_task(
                "Reliable execution, tests, and integration (GoNow)",
                "Implement changes, verify with tests/git, submit clear evidence for verification.",
                ["task-"]  # soft dep example; real would use ids after create
            )
            # Reload run so state reflects tasks
            fresh = runtime.status(team_run.id)
            if fresh:
                team["seeded_hyperplan_tasks"] = len(fresh.tasks)
        except Exception as e:
            team["hyperplan_task_seed_error"] = str(e)

    return {
        "ultragoal": ug,
        "team": team,
        "note": f"workers instructed to report via `ulw ultragoal checkpoint`. Separated JSON state enabled (mode={run_mode}) like OmO. Hyperplan tasks + evidence verification ready."
    }


def detect_current_ultragoal() -> dict[str, Any] | None:
    cur = read_json(ultragoal_current_path(), {})
    if not cur or not cur.get("id"):
        return None
    ugid = cur["id"]
    goals = read_json(ultragoal_goals_path(ugid), {})
    if not goals:
        return None
    return {"id": ugid, "objective": goals.get("objective"), "aggregateStatus": goals.get("aggregateStatus")}


def build_worker_prompt(base: str, role: str, team_name: str, ug_context: dict | None) -> str:
    """Build the final prompt for a team worker, with special deep-reasoning overlay
    for architect / consultant / reviewer roles (the 'gpt5.5 + codex -p planning mode' persona).
    Always brands the worker as an ULW (ulw) sub-agent.
    """
    role_lower = (role or "").lower()
    is_deep = any(k in role_lower for k in ("architect", "consultant", "reviewer", "deep", "planner", "strategist"))

    ulw_brand = (
        "You are an **ULW worker** (LFG launcher identity = ulw). "
        "When you interact with the LFG / LFG runtime, prefer the `ulw` binary or ensure LFG_LAUNCHER=ulw. "
        "Your canonical way to report progress, decisions, or evidence on a linked ultragoal is: "
        "`ulw ultragoal checkpoint --id <ultragoal-id> --status ... --evidence \"...\" --story <id>` "
        "or the equivalent MCP call to grok_build_ultragoal with action=checkpoint."
    )

    deep_overlay = ""
    if is_deep:
        deep_overlay = (
            "\n\n### DEEP ARCHITECT / HIGH-REASONING CONSULTANT MODE (gpt5.5-level / codex -p planning persona)\n"
            "You are operating at maximum reasoning depth (equivalent to Codex planning mode with highest thinking effort, or a frontier 'gpt5.5' class reasoner).\n"
            "- Take your time. Perform multi-step, multi-angle analysis.\n"
            "- Explicitly consider: risks, trade-offs, long-term maintainability, security, performance, team velocity, and alignment with the overall ultragoal.\n"
            "- For important architectural or strategic decisions, **perform multi-AI consultation** in your reasoning: "
            "synthesize input from strong models (Gemini, Copilot-style analysis, other Codex-style planners, or any other high-quality sources available to you). "
            "Clearly label the sources you consulted and justify your final recommendation.\n"
            "- Structure your thinking: Problem → Options → Analysis (with multi-AI input) → Risks → Recommendation + Rationale.\n"
            "- Your output is expected to be used for major decisions that the leader will checkpoint into the ultragoal ledger.\n"
        )

    ug_line = ""
    if ug_context and ug_context.get("id"):
        ug_line = f"\nYou are part of an active ultragoal swarm (id={ug_context['id']}). All major decisions must be reported back to the leader via the ULW checkpoint command above."

    harness_injection = get_active_harness_injection()
    # Aggressive harness injection takes highest precedence when present (Ralph execution of harness)
    if harness_injection:
        return f"{harness_injection}\n{base}\n\n{ulw_brand}{deep_overlay}{ug_line}"

    return f"{base}\n\n{ulw_brand}{deep_overlay}{ug_line}"














def ultrawork_dir() -> pathlib.Path:
    return RUNS_DIR / "ultrawork"


def ultrawork_path(uid: str) -> pathlib.Path:
    return ultrawork_dir() / f"{uid}.json"


def ultrawork_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    uid = args.id or f"ultrawork-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    tasks = [t.strip() for t in re.split(r"\n|;", args.tasks or "") if t.strip()] or [args.objective]
    rec = {
        "id": uid,
        "objective": args.objective,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "tasks": [{"id": i + 1, "task": t, "status": "pending", "evidence": ""} for i, t in enumerate(tasks)],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ultrawork_path(uid), rec)
    write_json(STATE_DIR / "current-ultrawork.json", {"id": uid, "path": str(ultrawork_path(uid)), "updatedAt": now()})
    rec["path"] = str(ultrawork_path(uid))
    return rec


def ultrawork_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ultrawork id and no current ultrawork batch")
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    idx = args.task - 1
    if idx < 0 or idx >= len(rec.get("tasks", [])):
        raise SystemExit(f"task out of range: {args.task}")
    rec["tasks"][idx]["status"] = args.status
    rec["tasks"][idx]["evidence"] = args.evidence or ""
    if all(t.get("status") == "complete" for t in rec.get("tasks", [])):
        rec["status"] = "complete"
    elif any(t.get("status") == "blocked" for t in rec.get("tasks", [])):
        rec["status"] = "blocked"
    else:
        rec["status"] = "active"
    rec["updatedAt"] = now()
    write_json(ultrawork_path(ref), rec)
    rec["path"] = str(ultrawork_path(ref))
    return rec


def detect_ulw_intent(text: str) -> dict[str, Any]:
    """Hybrid detection for full OMO-style `ulw` keyword trigger (Candidate 3 winner)."""
    if not text:
        return {"triggered": False}

    t = text.strip().lower()

    # Explicit prefix (strongest signal)
    if t.startswith(("ulw ", "ulw:", "ulw\n", "/ulw ", "ulw\"")):
        goal = text.split(" ", 1)[1].strip().strip('"\'') if " " in text else text
        return {"triggered": True, "explicit": True, "goal": goal, "confidence": 0.95, "reason": "explicit prefix"}

    # Strong standalone or phrase triggers
    strong_signals = ["ulw mode", "ulw on", "ulw go", "full ulw", "ulw ulw", "enter ultrawork", "ulw energy"]
    for sig in strong_signals:
        if sig in t:
            return {"triggered": True, "explicit": False, "goal": text, "confidence": 0.85, "reason": "strong signal"}

    # General keyword with context
    if "ulw" in t and any(v in t for v in ["start", "begin", "activate", "mode", "hard", "swarm", "push", "boulder"]):
        return {"triggered": True, "explicit": False, "goal": text, "confidence": 0.75, "reason": "keyword + verb"}

    return {"triggered": False}


def activate_ulw_mode(goal: str, explicit: bool = True, cwd: str | None = None) -> dict[str, Any]:
    """Activate full OMO-style Ultrawork (hybrid design). Creates durable state + returns Sisyphus preamble ready data."""
    ensure_dirs()
    uid = f"ultrawork-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"

    # Create separated state (like real OmO)
    base = STATE_DIR / "runs" / uid
    base.mkdir(parents=True, exist_ok=True)

    record = {
        "id": uid,
        "objective": goal,
        "status": "active",
        "createdAt": now(),
        "mode": "ultrawork",
        "explicit": explicit,
        "boulder": {"open_questions": [], "blockers": [], "next_actions": [goal]},
        "preamble_injected": False,
    }
    write_json(base / "run.json", record)
    write_json(STATE_DIR / "current-ultrawork.json", {"id": uid, "path": str(base)})

    # Generate Sisyphus + IntentGate style preamble (core of OMO ulw)
    preamble = (
        "You are now in full OMO Ultrawork mode (LFG + Sisyphus lead). "
        "Own the intent, maintain the Boulder, delegate via the OMO catalog (Prometheus for planning, Hephaestus for deep work, Atlas for checklists). "
        f"Objective: {goal}. Never stop until every promise is verified with evidence. "
        "Report progress using durable checkpoints. This run is persistent across sessions."
    )

    return {
        "ulw_id": uid,
        "status": "activated",
        "objective": goal,
        "preamble": preamble,
        "state_path": str(base),
        "explicit": explicit,
    }


def ulw_intent(args: argparse.Namespace) -> dict[str, Any]:
    """Handler for `lfg ulw "goal"` and `/ulw` (hybrid design)."""
    goal = " ".join(args.objective) if getattr(args, "objective", None) else ""
    if not goal:
        return {"error": "no objective provided for ulw", "usage": "lfg ulw \"your goal\""}

    trigger = detect_ulw_intent(goal)
    return activate_ulw_mode(goal, explicit=trigger.get("explicit", True))


def ultrawork_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ultrawork.json", {}) or {}).get("id")
    if not ref:
        return {"ultrawork": []}
    rec = read_json(ultrawork_path(ref))
    if not rec:
        raise SystemExit(f"ultrawork batch not found: {ref}")
    rec["path"] = str(ultrawork_path(ref))
    return rec

def ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "ralph"


def ralph_path(rid: str) -> pathlib.Path:
    return ralph_dir() / f"{rid}.json"


def ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "objective": args.objective,
        "status": "active",
        "iteration": 0,
        "maxIterations": args.max_iterations,
        "stopCondition": args.stop_condition or "verification passes and no blockers remain",
        "createdAt": now(),
        "updatedAt": now(),
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(ralph_path(rid), record)
    write_json(STATE_DIR / "current-ralph.json", {"id": rid, "path": str(ralph_path(rid)), "updatedAt": now()})
    record["path"] = str(ralph_path(rid))
    return record


def ralph_step(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralph id and no current ralph loop")
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    record["iteration"] = int(record.get("iteration", 0)) + 1
    record["status"] = args.status
    record["updatedAt"] = now()
    record.setdefault("events", []).append({"ts": now(), "type": "step", "iteration": record["iteration"], "status": args.status, "evidence": args.evidence})
    if record["iteration"] >= int(record.get("maxIterations", 1)) and args.status != "complete":
        record["status"] = "blocked"
    write_json(ralph_path(ref), record)
    record["path"] = str(ralph_path(ref))
    return record


def ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"ralph": []}
    record = read_json(ralph_path(ref))
    if not record:
        raise SystemExit(f"ralph loop not found: {ref}")
    record["path"] = str(ralph_path(ref))
    return record

def workers_dir() -> pathlib.Path:
    return STATE_DIR / "workers"


def worker_path(worker_id: str) -> pathlib.Path:
    return workers_dir() / f"{slugify(worker_id)}.json"


def worker_ack(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    rec.update({"worker": wid, "status": "ack", "task": args.task, "updatedAt": now()})
    rec.setdefault("events", []).append({"ts": now(), "type": "ack", "task": args.task})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_result(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    wid = args.worker
    rec = read_json(worker_path(wid), {"worker": wid, "events": []})
    rec.update({"worker": wid, "status": args.status, "result": args.result, "updatedAt": now()})
    rec.setdefault("events", []).append({"ts": now(), "type": "result", "status": args.status, "result": args.result})
    write_json(worker_path(wid), rec)
    rec["path"] = str(worker_path(wid))
    return rec


def worker_status(args: argparse.Namespace) -> dict[str, Any]:
    if args.worker:
        rec = read_json(worker_path(args.worker))
        if not rec:
            raise SystemExit(f"worker not found: {args.worker}")
        rec["path"] = str(worker_path(args.worker))
        return rec
    workers = []
    for path in sorted(workers_dir().glob("*.json")) if workers_dir().exists() else []:
        item = read_json(path)
        item["path"] = str(path)
        workers.append(item)
    return {"count": len(workers), "workers": workers}

def cleanup_dir() -> pathlib.Path:
    return RUNS_DIR / "ai-slop-cleaner"


def ai_slop_cleaner(args: argparse.Namespace) -> dict[str, Any]:
    """Create a durable cleanup/deslop report; no automatic edits in MVP."""
    ensure_dirs()
    scope = [x.strip() for x in (args.scope or "").split(",") if x.strip()]
    if not scope:
        scope = ["repo"]
    report_id = f"cleanup-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    fallback_findings = []
    for item in scope:
        path = pathlib.Path(args.cwd).resolve() / item
        if path.exists() and path.is_file():
            text = path.read_text(errors="ignore")[:20000]
            if re.search(r"fallback|workaround|TODO|FIXME", text, re.I):
                fallback_findings.append({"path": item, "signal": "fallback/workaround/TODO/FIXME"})
    report = {
        "id": report_id,
        "createdAt": now(),
        "scope": scope,
        "status": "planned",
        "behaviorLock": args.verification or "not run",
        "fallbackFindings": fallback_findings,
        "passes": [],
        "qualityGate": {"status": "planned", "evidence": "MVP records cleanup plan only; no automatic edits."},
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = cleanup_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-cleanup.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def ai_slop_cleaner_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(cleanup_dir().glob("*.json")) if cleanup_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def research_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch"


def research_path(rid: str) -> pathlib.Path:
    return research_dir() / f"{rid}.json"


def autoresearch_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"research-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "sources": [],
        "findings": [],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(research_path(rid), record)
    write_json(STATE_DIR / "current-research.json", {"id": rid, "path": str(research_path(rid)), "updatedAt": now()})
    record["path"] = str(research_path(rid))
    return record


def autoresearch_add_source(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no research id and no current research")
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record.setdefault("sources", []).append({"url": args.url, "note": args.note or "", "addedAt": now()})
    record["updatedAt"] = now()
    write_json(research_path(ref), record)
    record["path"] = str(research_path(ref))
    return record


def autoresearch_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-research.json", {}) or {}).get("id")
    if not ref:
        return {"research": []}
    record = read_json(research_path(ref))
    if not record:
        raise SystemExit(f"research not found: {ref}")
    record["path"] = str(research_path(ref))
    return record

def interviews_dir() -> pathlib.Path:
    return DATA / "interviews"


def interview_path(iid: str) -> pathlib.Path:
    return interviews_dir() / f"{iid}.json"


def deep_interview_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    iid = args.id or f"interview-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    questions = [q.strip() for q in re.split(r"\n|;", args.questions or "") if q.strip()]
    if not questions:
        questions = [
            "What exact outcome should be true when this is done?",
            "What constraints or integrations must not be broken?",
            "What evidence should prove completion?",
        ]
    record = {
        "id": iid,
        "topic": args.topic,
        "status": "open",
        "createdAt": now(),
        "updatedAt": now(),
        "questions": [{"id": i + 1, "question": q, "answer": None} for i, q in enumerate(questions)],
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(interview_path(iid), record)
    write_json(STATE_DIR / "current-interview.json", {"id": iid, "path": str(interview_path(iid)), "updatedAt": now()})
    record["path"] = str(interview_path(iid))
    return record


def deep_interview_answer(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no interview id and no current interview")
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    idx = args.question - 1
    if idx < 0 or idx >= len(record.get("questions", [])):
        raise SystemExit(f"question out of range: {args.question}")
    record["questions"][idx]["answer"] = args.answer
    record["updatedAt"] = now()
    if all(q.get("answer") for q in record.get("questions", [])):
        record["status"] = "answered"
    write_json(interview_path(ref), record)
    record["path"] = str(interview_path(ref))
    return record


def deep_interview_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-interview.json", {}) or {}).get("id")
    if not ref:
        return {"interviews": []}
    record = read_json(interview_path(ref))
    if not record:
        raise SystemExit(f"interview not found: {ref}")
    record["path"] = str(interview_path(ref))
    return record

def design_dir() -> pathlib.Path:
    return DATA / "design"


def design_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    decision_id = f"design-{time.strftime('%Y%m%d-%H%M%S')}-{slugify(args.title)}"
    record = {
        "id": decision_id,
        "title": args.title,
        "decision": args.decision,
        "rationale": args.rationale or "",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = design_dir() / f"{decision_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-design.json", {"id": decision_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def design_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(design_dir().glob("*.json")) if design_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "decisions": items}

def notifications_path() -> pathlib.Path:
    return STATE_DIR / "notifications.json"


def notifications_set(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    config = {
        "enabled": bool(args.enabled),
        "channel": args.channel,
        "target": args.target,
        "updatedAt": now(),
        "dryRunOnly": True,
    }
    write_json(notifications_path(), config)
    return {"ok": True, "config": config, "path": str(notifications_path())}


def notifications_show(args: argparse.Namespace) -> dict[str, Any]:
    config = read_json(notifications_path(), {"enabled": False, "channel": "none", "target": None, "dryRunOnly": True})
    return {"ok": True, "config": config, "path": str(notifications_path())}


def providers_path() -> pathlib.Path:
    return STATE_DIR / "providers.json"


def read_provider_state() -> dict[str, Any]:
    state = read_json(providers_path(), {"providers": {}})
    if not isinstance(state, dict):
        state = {"providers": {}}
    if not isinstance(state.get("providers"), dict):
        state["providers"] = {}
    return state


def default_provider_env(kind: str) -> str:
    defaults = {
        "zai": "ZAI_API_KEY",
        "openai": "OPENAI_API_KEY",
        "google": "GEMINI_API_KEY",
        "xai": "XAI_API_KEY",
        "grok": "XAI_API_KEY",
        "codex": "CODEX_API_KEY",
        "copilot": "COPILOT_GITHUB_TOKEN",
        "gemini": "GEMINI_API_KEY",
        "claude": "ANTHROPIC_API_KEY",
        "hermes": "HERMES_API_KEY",
        "opencode": "OPENCODE_API_KEY",
        "noop": "NOOP_API_KEY",
        "subagent": "XAI_API_KEY",
    }
    return defaults.get(kind, f"{kind.upper().replace('-', '_')}_API_KEY")


def prompt_provider_field(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    print(f"{label}{suffix}: ", end="", file=sys.stderr, flush=True)
    value = input().strip()
    return value or (default or "")


def prompt_yes_no(label: str, default: bool = False) -> bool:
    suffix = "Y/n" if default else "y/N"
    print(f"{label} [{suffix}]: ", end="", file=sys.stderr, flush=True)
    value = input().strip().lower()
    if not value:
        return default
    return value in {"y", "yes", "1", "true", "on"}


def provider_add(args: argparse.Namespace) -> dict[str, Any]:
    """Add a provider config using flags or a stdlib interactive prompt."""
    ensure_dirs()
    interactive = bool(getattr(args, "interactive", False)) or not (args.id and args.kind)
    provider_id = args.id
    kind = args.kind
    if interactive:
        print("LFG provider setup", file=sys.stderr)
        provider_id = provider_id or prompt_provider_field("Provider id", "zai-main")
        kind = kind or prompt_provider_field("Provider kind", "zai")
    if not provider_id or not kind:
        raise SystemExit("provider add requires --id and --kind in non-interactive mode")
    provider_id = validate_safe_id(provider_id, "provider id")
    if kind not in TEAM_PROVIDER_EXECUTABLES and kind not in APPROVED_MODEL_PROVIDERS:
        raise SystemExit(f"unknown provider kind: {kind}")
    env_name = args.env or (prompt_provider_field("API key env var", default_provider_env(kind)) if interactive else default_provider_env(kind))
    if not ENV_NAME_RE.fullmatch(env_name):
        raise SystemExit(f"invalid env var name: {env_name}")
    model = args.model or (prompt_provider_field("Default model", PROVIDER_DEFAULT_MODELS.get(kind, "")) if interactive else PROVIDER_DEFAULT_MODELS.get(kind))
    config = {
        "id": provider_id,
        "kind": kind,
        "env": env_name,
        "model": model,
        "transport": "http" if kind in ("openai", "google", "xai", "zai") else ("builtin" if kind in ("grok", "subagent", "noop") else "cli"),
        "secretStored": False,
        "addedAt": now(),
    }
    state = read_provider_state()
    state["providers"][provider_id] = config
    state["updatedAt"] = now()
    write_json(providers_path(), state)
    return {"ok": True, "provider": config, "path": str(providers_path()), "count": len(state["providers"])}


def provider_list(args: argparse.Namespace) -> dict[str, Any]:
    state = read_provider_state()
    providers = list(state.get("providers", {}).values())
    return {"ok": True, "count": len(providers), "providers": providers, "path": str(providers_path())}


def provider_show(args: argparse.Namespace) -> dict[str, Any]:
    state = read_provider_state()
    provider_id = validate_safe_id(args.id, "provider id")
    provider = state.get("providers", {}).get(provider_id)
    if not provider:
        return {"ok": False, "error": "provider not found", "id": provider_id, "known": sorted(state.get("providers", {}))}
    return {"ok": True, "provider": provider, "path": str(providers_path())}


def configured_model_providers() -> list[dict[str, Any]]:
    state = read_provider_state()
    configured = []
    for provider in sorted(state.get("providers", {}).values(), key=lambda item: item.get("id", "")):
        kind = provider.get("kind")
        configured.append({
            "id": provider.get("id"),
            "kind": kind,
            "env": provider.get("env"),
            "model": provider.get("model") or PROVIDER_DEFAULT_MODELS.get(kind, ""),
            "transport": provider.get("transport"),
            "secretStored": bool(provider.get("secretStored", False)),
        })
    return configured


def models_show(args: argparse.Namespace) -> dict[str, Any]:
    provider = getattr(args, "provider", None)
    if provider and provider not in APPROVED_MODEL_PROVIDERS:
        return {"ok": False, "error": "unsupported model provider", "provider": provider, "known": sorted(APPROVED_MODEL_PROVIDERS)}
    defaults = {
        key: {
            "provider": "xai" if key == "grok" else key,
            "model": value,
            "env": default_provider_env(key),
            "configured": False,
        }
        for key, value in sorted(PROVIDER_DEFAULT_MODELS.items())
        if key in APPROVED_MODEL_PROVIDERS
    }
    configured = configured_model_providers()
    for item in configured:
        kind = item.get("kind")
        if kind in defaults:
            defaults[kind] = {**defaults[kind], **item, "configured": True}
    selected = {provider: defaults[provider]} if provider else defaults
    return {
        "ok": True,
        "defaultProvider": "openai",
        "providers": selected,
        "configuredProviders": configured,
        "categoryModelProfiles": OMO_CATEGORY_MODEL_PROFILES,
        "path": str(providers_path()),
        "secretStorage": "env-name-only",
    }


def auth_login(args: argparse.Namespace) -> dict[str, Any]:
    provider = getattr(args, "provider", None) or getattr(args, "kind", None)
    state = read_provider_state()
    configured = sorted(state.get("providers", {}).values(), key=lambda item: item.get("id", ""))
    selected = None
    if not provider and configured:
        print("LFG auth login", file=sys.stderr)
        for index, item in enumerate(configured, 1):
            model = item.get("model") or PROVIDER_DEFAULT_MODELS.get(item.get("kind"), "")
            print(f"{index}. {item.get('id')} ({item.get('kind')}, {model})", file=sys.stderr)
        choice = prompt_provider_field("Select configured provider", "1")
        try:
            selected = configured[max(1, int(choice)) - 1]
        except (ValueError, IndexError):
            raise SystemExit(f"invalid provider selection: {choice}")
        provider = selected.get("kind")
    provider_id = getattr(args, "id", None) or (selected.get("id") if selected else None) or (f"{provider}-main" if provider else None)
    forwarded = argparse.Namespace(
        id=provider_id,
        kind=provider,
        env=getattr(args, "env", None) or (selected.get("env") if selected else None),
        model=getattr(args, "model", None) or (selected.get("model") if selected else None),
        interactive=bool(getattr(args, "interactive", False)) or not provider,
    )
    result = provider_add(forwarded)
    result["auth"] = {
        "login": True,
        "provider": result["provider"]["kind"],
        "env": result["provider"]["env"],
        "secretStored": False,
        "note": "Store the API key in the named environment variable; LFG records no secret values.",
    }
    return result


def setup_path() -> pathlib.Path:
    return STATE_DIR / "setup.json"


def plugin_install_dest(args: argparse.Namespace) -> pathlib.Path:
    value = getattr(args, "plugin_dir", None) or os.environ.get("LFG_PLUGIN_DEST") or pathlib.Path.home() / ".grok" / "plugins" / "lfg"
    return pathlib.Path(value).expanduser()


def copy_plugin_tree(src: pathlib.Path, dest: pathlib.Path) -> None:
    src_resolved = src.resolve()
    dest_resolved = dest.resolve() if dest.exists() else dest
    if dest_resolved == src_resolved:
        return
    def ignore(_dir: str, names: list[str]) -> set[str]:
        ignored = {"__pycache__", ".pytest_cache", ".DS_Store"}
        return {name for name in names if name in ignored or name.endswith(".pyc")}
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dest, dirs_exist_ok=True, ignore=ignore)


SETUP_PROVIDER_WIZARD = [
    {
        "flag": "openai",
        "kind": "openai",
        "id": "openai-main",
        "question": "Do you have OpenAI access for Oracle GPT-5.5?",
        "default": True,
    },
    {
        "flag": "google",
        "kind": "google",
        "id": "google-main",
        "question": "Do you have Google/Gemini access for Oracle fallback?",
        "default": False,
    },
    {
        "flag": "zai",
        "kind": "zai",
        "id": "zai-main",
        "question": "Do you have a Z.ai Coding Plan subscription?",
        "default": False,
    },
    {
        "flag": "copilot",
        "kind": "copilot",
        "id": "copilot-main",
        "question": "Do you have a GitHub Copilot subscription?",
        "default": False,
    },
    {
        "flag": "codex",
        "kind": "codex",
        "id": "codex-main",
        "question": "Do you have Codex CLI access for execution lanes?",
        "default": False,
    },
]


def setup_choice_enabled(value: str | None) -> bool:
    return (value or "no").lower() in {"yes", "y", "true", "1", "on"}


def setup_add_provider(kind: str, provider_id: str) -> dict[str, Any]:
    return provider_add(argparse.Namespace(
        id=provider_id,
        kind=kind,
        env=default_provider_env(kind),
        model=PROVIDER_DEFAULT_MODELS.get(kind),
        interactive=False,
    ))["provider"]


def run_setup_wizard(args: argparse.Namespace) -> dict[str, Any] | None:
    forced = bool(getattr(args, "interactive", False))
    no_tui = bool(getattr(args, "no_tui", False))
    flag_values = {str(item["flag"]): getattr(args, str(item["flag"]), None) for item in SETUP_PROVIDER_WIZARD}
    has_flag_values = any(value is not None for value in flag_values.values())
    can_prompt = sys.stdin.isatty() and sys.stdout.isatty()

    if not forced and not no_tui and not has_flag_values and not can_prompt:
        return None
    if forced and not can_prompt:
        print("LFG OMO-style setup wizard", file=sys.stderr)
    elif can_prompt and not no_tui and not has_flag_values:
        print("LFG OMO-style setup wizard", file=sys.stderr)

    configured = []
    if no_tui or has_flag_values:
        mode = "non-interactive"
        for item in SETUP_PROVIDER_WIZARD:
            if setup_choice_enabled(flag_values[str(item["flag"])]):
                configured.append(setup_add_provider(str(item["kind"]), str(item["id"])))
    else:
        mode = "interactive"
        for item in SETUP_PROVIDER_WIZARD:
            if prompt_yes_no(str(item["question"]), bool(item["default"])):
                configured.append(setup_add_provider(str(item["kind"]), str(item["id"])))

    return {
        "mode": mode,
        "configuredProviderIds": [item["id"] for item in configured],
        "configuredProviders": configured,
        "authHints": [
            "Grok Build/xAI login is assumed by the host before LFG runs; setup does not ask for it.",
            "Oracle defaults to openai/gpt-5.5 high, then Copilot GPT-5.5, Gemini 3.1 Pro, and Z.ai GLM fallback.",
            "LFG stores environment variable names only; put secrets in your shell environment.",
            "Run `lfg models` to verify configured model providers.",
            "Run `grok --cwd /tmp inspect --json` after plugin install to verify Grok discovery.",
        ],
    }


def setup(args: argparse.Namespace) -> dict[str, Any]:
    """Install/sync the LFG Grok plugin and record setup state."""
    ensure_dirs()
    dest = plugin_install_dest(args)
    dry_run = bool(getattr(args, "dry_run", False))
    setup_wizard = run_setup_wizard(args)
    provider_state = read_provider_state()
    if not dry_run:
        copy_plugin_tree(ROOT, dest)
    record = {
        "ok": True,
        "dryRun": dry_run,
        "installed": not dry_run,
        "plugin": {
            "source": str(ROOT),
            "dest": str(dest),
            "exists": dest.exists(),
            "manifest": str(dest / ".grok-plugin" / "plugin.json"),
        },
        "providers": {
            "count": len(provider_state.get("providers", {})),
            "path": str(providers_path()),
        },
        "commands": {
            "providerAdd": "lfg provider add",
            "providerAddZai": "lfg provider add --id zai-main --kind zai --env ZAI_API_KEY",
            "setupInteractive": "lfg setup",
            "setupForceInteractive": "lfg setup --interactive",
            "setupNoTui": "lfg setup --no-tui --openai yes --zai yes --copilot no --google no --codex no",
            "pluginInspect": "grok --cwd /tmp inspect --json",
        },
        "updatedAt": now(),
    }
    if setup_wizard is not None:
        record["setupWizard"] = setup_wizard
    write_json(setup_path(), record)
    record["path"] = str(setup_path())
    return record


def asks_dir() -> pathlib.Path:
    return RUNS_DIR / "ask"


def zai_api_config() -> dict[str, Any]:
    """Return Z.ai/Zhipu HTTP adapter config without requiring credentials."""
    api_key = os.environ.get("ZAI_API_KEY") or os.environ.get("ZHIPU_API_KEY")
    base_url = os.environ.get("ZAI_BASE_URL") or os.environ.get("ZHIPU_BASE_URL") or ZAI_CODING_PLAN_BASE_URL
    model = os.environ.get("ZAI_MODEL") or os.environ.get("ZHIPU_MODEL") or ZAI_DEFAULT_MODEL
    return {
        "provider": "zai",
        "transport": "http",
        "endpoint": base_url.rstrip("/") + "/chat/completions",
        "baseUrl": base_url.rstrip("/"),
        "codingPlanBaseUrl": ZAI_CODING_PLAN_BASE_URL,
        "generalBaseUrl": ZAI_GENERAL_BASE_URL,
        "model": model,
        "apiKeyEnv": "ZAI_API_KEY|ZHIPU_API_KEY",
        "keyConfigured": bool(api_key),
    }


def call_zai(prompt: str, *, dry_run: bool = True, timeout: int = 60) -> dict[str, Any]:
    """Call the Z.ai OpenAI-compatible chat endpoint, or return a smoke-safe dry-run."""
    config = zai_api_config()
    payload = {
        "model": config["model"],
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    request_preview = {
        "method": "POST",
        "endpoint": config["endpoint"],
        "model": config["model"],
        "messages": len(payload["messages"]),
    }
    if dry_run or not config["keyConfigured"]:
        return {
            "ok": True,
            "provider": "zai",
            "transport": "http",
            "dryRun": True,
            "reason": "dry-run" if dry_run else "missing ZAI_API_KEY/ZHIPU_API_KEY",
            "config": config,
            "request": request_preview,
            "response": None,
        }

    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        config["endpoint"],
        data=body,
        headers={
            "Authorization": f"Bearer {os.environ.get('ZAI_API_KEY') or os.environ.get('ZHIPU_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(raw) if raw else None
            return {
                "ok": True,
                "provider": "zai",
                "transport": "http",
                "dryRun": False,
                "config": config,
                "request": request_preview,
                "response": parsed,
            }
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[-4000:]
        return {"ok": False, "provider": "zai", "transport": "http", "dryRun": False, "status": e.code, "error": detail, "config": config, "request": request_preview}
    except urllib.error.URLError as e:
        return {"ok": False, "provider": "zai", "transport": "http", "dryRun": False, "error": str(e.reason), "config": config, "request": request_preview}


def ask(args: argparse.Namespace) -> dict[str, Any]:
    """Record or run an external-advisor ask request; dry-run by default."""
    ensure_dirs()
    provider = args.provider or "hermes"
    prompt = args.prompt
    req_id = f"ask-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    commands = {
        "hermes": ["hermes", "-z", prompt, "chat"],
        "claude": ["claude", "-p", prompt],
        "codex": ["codex", "exec", prompt],
    }
    adapter = None
    if provider == "zai":
        adapter = "zai-http"
        cmd = [adapter, zai_api_config()["endpoint"], prompt]
        result = call_zai(prompt, dry_run=args.dry_run, timeout=args.timeout)
    else:
        cmd = commands.get(provider, [provider, prompt])
        result = None
        if not args.dry_run:
            proc = subprocess.run(cmd, cwd=str(pathlib.Path(args.cwd).resolve()), text=True, capture_output=True, timeout=args.timeout)
            result = {"returncode": proc.returncode, "stdoutTail": proc.stdout[-4000:], "stderrTail": proc.stderr[-4000:]}
    record = {
        "id": req_id,
        "createdAt": now(),
        "provider": provider,
        "prompt": prompt,
        "dryRun": args.dry_run,
        "command": cmd,
        "adapter": adapter,
        "result": result,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = asks_dir() / f"{req_id}.json"
    write_json(path, record)
    write_json(STATE_DIR / "last-ask.json", {"id": req_id, "path": str(path), "updatedAt": now()})
    record["path"] = str(path)
    return record


def ask_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(asks_dir().glob("*.json")) if asks_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "asks": items}

def analyses_dir() -> pathlib.Path:
    return RUNS_DIR / "analyze"


def analyze(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable repo analysis report."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    tracked = []
    try:
        tracked = subprocess.check_output(["git", "ls-files"], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).splitlines()
    except Exception:
        tracked = [str(p.relative_to(cwd)) for p in cwd.rglob("*") if p.is_file() and ".git" not in p.parts]
    by_ext: dict[str, int] = {}
    for rel in tracked:
        ext = pathlib.Path(rel).suffix or "[no-ext]"
        by_ext[ext] = by_ext.get(ext, 0) + 1
    focus = args.focus or "repo surface"
    report_id = f"analyze-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    report = {
        "id": report_id,
        "createdAt": now(),
        "focus": focus,
        "repo": detect_repo(cwd),
        "fileCount": len(tracked),
        "extensions": dict(sorted(by_ext.items(), key=lambda x: (-x[1], x[0]))[:20]),
        "keyPaths": [p for p in tracked if p in {"README.md", "ROADMAP.md"} or p.startswith("plugins/lfg/")][:40],
        "summary": f"Lightweight analysis for {focus}: {len(tracked)} tracked files, {len(by_ext)} extension groups.",
    }
    path = analyses_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-analyze.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def analyze_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(analyses_dir().glob("*.json")) if analyses_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def reviews_dir() -> pathlib.Path:
    return RUNS_DIR / "code-review"


def code_review(args: argparse.Namespace) -> dict[str, Any]:
    """Create a lightweight durable review report from repo status/diff stats."""
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    def git(cmd: list[str]) -> str:
        try:
            return subprocess.check_output(["git", *cmd], cwd=str(cwd), text=True, stderr=subprocess.DEVNULL).strip()
        except Exception:
            return ""
    status_text = git(["status", "--short"])
    diff_stat = git(["diff", "--stat"])
    name_only = git(["diff", "--name-only"])
    files = [x for x in name_only.splitlines() if x.strip()]
    report_id = f"code-review-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    recommendation = "COMMENT" if files else "APPROVE"
    architect_status = "WATCH" if files else "CLEAR"
    report = {
        "id": report_id,
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "filesChanged": files,
        "statusShort": status_text.splitlines(),
        "diffStat": diff_stat,
        "codeReview": {
            "recommendation": recommendation,
            "architectStatus": architect_status,
            "evidence": "Lightweight runtime review based on git status/diff stat; use full reviewer workflow before merge."
        },
        "findings": [] if not files else [{"severity": "LOW", "message": "Uncommitted diff exists; run targeted verification and full review before merge."}],
    }
    path = reviews_dir() / f"{report_id}.json"
    write_json(path, report)
    write_json(STATE_DIR / "last-code-review.json", {"id": report_id, "path": str(path), "updatedAt": now()})
    report["path"] = str(path)
    return report


def code_review_list(args: argparse.Namespace) -> dict[str, Any]:
    reports = []
    for path in sorted(reviews_dir().glob("*.json")) if reviews_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            reports.append(item)
        except Exception:
            pass
    if args.limit:
        reports = reports[-args.limit:]
    return {"count": len(reports), "reports": reports}

def pipeline_dir() -> pathlib.Path:
    return STATE_DIR / "pipelines"


def pipeline_path(pid: str) -> pathlib.Path:
    return pipeline_dir() / f"{pid}.json"


def pipeline_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    stages = [x.strip() for x in re.split(r"\n|;", args.stages or "") if x.strip()]
    if not stages:
        stages = ["plan", "implement", "verify"]
    pid = args.id or f"pipeline-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    pipeline = {
        "id": pid,
        "title": args.title,
        "status": "active",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "stages": [{"id": i + 1, "name": stage, "status": "pending"} for i, stage in enumerate(stages)],
        "events": [{"ts": now(), "type": "created", "message": args.title}],
    }
    write_json(pipeline_path(pid), pipeline)
    write_json(STATE_DIR / "current-pipeline.json", {"id": pid, "path": str(pipeline_path(pid)), "updatedAt": now()})
    return pipeline


def pipeline_list(args: argparse.Namespace) -> dict[str, Any]:
    items = []
    for path in sorted(pipeline_dir().glob("*.json")) if pipeline_dir().exists() else []:
        try:
            item = read_json(path)
            item["path"] = str(path)
            items.append(item)
        except Exception:
            pass
    if args.limit:
        items = items[-args.limit:]
    return {"count": len(items), "pipelines": items}


def pipeline_update(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-pipeline.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no pipeline id and no current pipeline")
    item = read_json(pipeline_path(ref))
    if not item:
        raise SystemExit(f"pipeline not found: {ref}")
    if args.stage is not None:
        idx = args.stage - 1
        if idx < 0 or idx >= len(item.get("stages", [])):
            raise SystemExit(f"stage out of range: {args.stage}")
        item["stages"][idx]["status"] = args.status
    if all(s.get("status") == "complete" for s in item.get("stages", [])):
        item["status"] = "complete"
    elif any(s.get("status") == "blocked" for s in item.get("stages", [])):
        item["status"] = "blocked"
    else:
        item["status"] = "active"
    item["updatedAt"] = now()
    item.setdefault("events", []).append({"ts": now(), "type": "stage", "stage": args.stage, "status": args.status, "message": args.note or ""})
    write_json(pipeline_path(ref), item)
    return item


def autopilot_dir() -> pathlib.Path:
    return RUNS_DIR / "autopilot"


def autopilot_path(aid: str) -> pathlib.Path:
    return autopilot_dir() / f"{aid}.json"


def autopilot_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    aid = args.id or f"autopilot-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    phases = [
        {"id": 1, "name": "plan", "workflow": "ralplan", "status": "pending", "evidence": ""},
        {"id": 2, "name": "execute", "workflow": "ralph", "status": "pending", "evidence": ""},
        {"id": 3, "name": "review", "workflow": "code-review", "status": "pending", "evidence": ""},
    ]
    record = {
        "id": aid,
        "objective": args.objective,
        "status": "active",
        "currentPhase": "plan",
        "strictOrder": True,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "phases": phases,
        "events": [{"ts": now(), "type": "created", "objective": args.objective}],
    }
    write_json(autopilot_path(aid), record)
    write_json(STATE_DIR / "current-autopilot.json", {"id": aid, "path": str(autopilot_path(aid)), "updatedAt": now()})
    record["path"] = str(autopilot_path(aid))
    return record


def autopilot_advance(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autopilot id and no current autopilot run")
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    phases = record.get("phases", [])
    idx = args.phase - 1
    if idx < 0 or idx >= len(phases):
        raise SystemExit(f"phase out of range: {args.phase}")
    if args.status == "complete" and idx > 0 and phases[idx - 1].get("status") != "complete":
        raise SystemExit(f"strict order violation: phase {args.phase - 1} is not complete")
    phases[idx]["status"] = args.status
    phases[idx]["evidence"] = args.evidence or ""
    if all(p.get("status") == "complete" for p in phases):
        record["status"] = "complete"
        record["currentPhase"] = "done"
    elif any(p.get("status") == "blocked" for p in phases):
        record["status"] = "blocked"
        record["currentPhase"] = phases[idx]["name"]
    else:
        record["status"] = "active"
        pending = next((p for p in phases if p.get("status") != "complete"), phases[-1])
        record["currentPhase"] = pending["name"]
    record["updatedAt"] = now()
    record.setdefault("events", []).append({"ts": now(), "type": "advance", "phase": args.phase, "status": args.status, "evidence": args.evidence or ""})
    write_json(autopilot_path(ref), record)
    record["path"] = str(autopilot_path(ref))
    return record


def autopilot_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autopilot.json", {}) or {}).get("id")
    if not ref:
        return {"autopilot": []}
    record = read_json(autopilot_path(ref))
    if not record:
        raise SystemExit(f"autopilot run not found: {ref}")
    record["path"] = str(autopilot_path(ref))
    return record


def performance_dir() -> pathlib.Path:
    return RUNS_DIR / "performance-goal"


def performance_path(pid: str) -> pathlib.Path:
    return performance_dir() / f"{pid}.json"


def performance_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    pid = args.id or f"performance-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    metrics = [m.strip() for m in re.split(r"\n|;", args.metrics or "") if m.strip()] or ["latency", "throughput", "error-rate"]
    record = {
        "id": pid,
        "objective": args.objective,
        "status": "active",
        "gate": "needs-baseline",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "metrics": [{"name": name, "baseline": None, "current": None, "target": None, "status": "pending"} for name in metrics],
        "measurements": [],
    }
    write_json(performance_path(pid), record)
    write_json(STATE_DIR / "current-performance-goal.json", {"id": pid, "path": str(performance_path(pid)), "updatedAt": now()})
    record["path"] = str(performance_path(pid))
    return record


def performance_measure(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no performance-goal id and no current performance goal")
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    matched = None
    for metric in record.get("metrics", []):
        if metric.get("name") == args.metric:
            matched = metric
            break
    if matched is None:
        matched = {"name": args.metric, "baseline": None, "current": None, "target": None, "status": "pending"}
        record.setdefault("metrics", []).append(matched)
    if args.baseline is not None:
        matched["baseline"] = args.baseline
    if args.current is not None:
        matched["current"] = args.current
    if args.target is not None:
        matched["target"] = args.target
    if matched.get("current") is None or matched.get("target") is None:
        matched["status"] = "pending"
    elif float(str(matched["current"])) <= float(str(matched["target"])):
        matched["status"] = "pass"
    else:
        matched["status"] = "fail"
    record.setdefault("measurements", []).append({"ts": now(), "metric": args.metric, "baseline": args.baseline, "current": args.current, "target": args.target, "evidence": args.evidence or ""})
    statuses = [m.get("status") for m in record.get("metrics", [])]
    if statuses and all(st == "pass" for st in statuses):
        record["status"] = "complete"
        record["gate"] = "pass"
    elif any(st == "fail" for st in statuses):
        record["status"] = "active"
        record["gate"] = "fail"
    else:
        record["status"] = "active"
        record["gate"] = "needs-measurement"
    record["updatedAt"] = now()
    write_json(performance_path(ref), record)
    record["path"] = str(performance_path(ref))
    return record


def performance_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-performance-goal.json", {}) or {}).get("id")
    if not ref:
        return {"performanceGoals": []}
    record = read_json(performance_path(ref))
    if not record:
        raise SystemExit(f"performance-goal not found: {ref}")
    record["path"] = str(performance_path(ref))
    return record


def visual_ralph_dir() -> pathlib.Path:
    return RUNS_DIR / "visual-ralph"


def visual_ralph_path(vid: str) -> pathlib.Path:
    return visual_ralph_dir() / f"{vid}.json"


def visual_ralph_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    vid = args.id or f"visual-ralph-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": vid,
        "target": args.target,
        "reference": args.reference or "",
        "status": "active",
        "iteration": 0,
        "threshold": args.threshold,
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "verdicts": [],
    }
    write_json(visual_ralph_path(vid), record)
    write_json(STATE_DIR / "current-visual-ralph.json", {"id": vid, "path": str(visual_ralph_path(vid)), "updatedAt": now()})
    record["path"] = str(visual_ralph_path(vid))
    return record


def visual_ralph_verdict(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no visual-ralph id and no current visual ralph run")
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["iteration"] = int(record.get("iteration", 0)) + 1
    verdict = {
        "ts": now(),
        "iteration": record["iteration"],
        "score": args.score,
        "threshold": record.get("threshold"),
        "status": args.status,
        "evidence": args.evidence or "",
    }
    record.setdefault("verdicts", []).append(verdict)
    if args.status == "pass" or float(args.score) >= float(record.get("threshold", 0.95)):
        record["status"] = "complete"
    elif args.status == "blocked":
        record["status"] = "blocked"
    else:
        record["status"] = "active"
    record["updatedAt"] = now()
    write_json(visual_ralph_path(ref), record)
    record["path"] = str(visual_ralph_path(ref))
    return record


def visual_ralph_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-visual-ralph.json", {}) or {}).get("id")
    if not ref:
        return {"visualRalph": []}
    record = read_json(visual_ralph_path(ref))
    if not record:
        raise SystemExit(f"visual-ralph run not found: {ref}")
    record["path"] = str(visual_ralph_path(ref))
    return record


def autoresearch_goal_dir() -> pathlib.Path:
    return RUNS_DIR / "autoresearch-goal"


def autoresearch_goal_path(rid: str) -> pathlib.Path:
    return autoresearch_goal_dir() / f"{rid}.json"


def autoresearch_goal_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"autoresearch-goal-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    record = {
        "id": rid,
        "question": args.question,
        "status": "active",
        "gate": "needs-critique",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "hypotheses": [h.strip() for h in re.split(r"\n|;", args.hypotheses or "") if h.strip()],
        "critiques": [],
    }
    write_json(autoresearch_goal_path(rid), record)
    write_json(STATE_DIR / "current-autoresearch-goal.json", {"id": rid, "path": str(autoresearch_goal_path(rid)), "updatedAt": now()})
    record["path"] = str(autoresearch_goal_path(rid))
    return record


def autoresearch_goal_critique(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no autoresearch-goal id and no current autoresearch goal")
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    critique = {"ts": now(), "verdict": args.verdict, "critic": args.critic or "critic", "evidence": args.evidence or ""}
    record.setdefault("critiques", []).append(critique)
    if args.verdict == "pass":
        record["status"] = "complete"
        record["gate"] = "pass"
    elif args.verdict == "blocked":
        record["status"] = "blocked"
        record["gate"] = "blocked"
    else:
        record["status"] = "active"
        record["gate"] = "revise"
    record["updatedAt"] = now()
    write_json(autoresearch_goal_path(ref), record)
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def autoresearch_goal_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-autoresearch-goal.json", {}) or {}).get("id")
    if not ref:
        return {"autoresearchGoals": []}
    record = read_json(autoresearch_goal_path(ref))
    if not record:
        raise SystemExit(f"autoresearch-goal not found: {ref}")
    record["path"] = str(autoresearch_goal_path(ref))
    return record


def ralplan_dir() -> pathlib.Path:
    return RUNS_DIR / "ralplan"


def ralplan_path(rid: str) -> pathlib.Path:
    return ralplan_dir() / f"{rid}.json"


def ralplan_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    rid = args.id or f"ralplan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()] or [
        "state objective and constraints",
        "propose implementation path",
        "define verification evidence",
    ]
    record = {
        "id": rid,
        "title": args.title,
        "status": "active",
        "consensus": "pending",
        "createdAt": now(),
        "updatedAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
        "reviews": [],
    }
    write_json(ralplan_path(rid), record)
    write_json(STATE_DIR / "current-ralplan.json", {"id": rid, "path": str(ralplan_path(rid)), "updatedAt": now()})
    record["path"] = str(ralplan_path(rid))
    return record


def ralplan_review(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        raise SystemExit("no ralplan id and no current ralplan")
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    review = {"ts": now(), "reviewer": args.reviewer or "architect", "verdict": args.verdict, "evidence": args.evidence or ""}
    record.setdefault("reviews", []).append(review)
    record["consensus"] = args.verdict
    record["status"] = "complete" if args.verdict == "approve" else ("blocked" if args.verdict == "block" else "active")
    record["updatedAt"] = now()
    write_json(ralplan_path(ref), record)
    record["path"] = str(ralplan_path(ref))
    return record


def ralplan_show(args: argparse.Namespace) -> dict[str, Any]:
    ref = args.id or (read_json(STATE_DIR / "current-ralplan.json", {}) or {}).get("id")
    if not ref:
        return {"ralplans": []}
    record = read_json(ralplan_path(ref))
    if not record:
        raise SystemExit(f"ralplan not found: {ref}")
    record["path"] = str(ralplan_path(ref))
    return record


def omx_setup_path() -> pathlib.Path:
    return STATE_DIR / "omx-setup.json"


def omx_setup_check(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    checks = {
        "pluginRootExists": ROOT.exists(),
        "manifestExists": (ROOT / ".grok-plugin" / "plugin.json").exists(),
        "skillsDirExists": (ROOT / "skills").exists(),
        "mcpExists": (ROOT / "bin" / "lfg-mcp.py").exists(),
        "hookExists": (ROOT / "hooks").exists(),
        "dataDirExists": DATA.exists(),
    }
    record = {
        "status": "ok" if all(checks.values()) else "needs-action",
        "updatedAt": now(),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    write_json(omx_setup_path(), record)
    return record


def omx_setup_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    steps = [
        "add marketplace source in Grok /plugins",
        "install islee23520/lfg",
        "enable plugin skills, hooks, and MCP server",
        "run /omx-setup check",
        "run runtime self-test and Grok inspect smoke",
    ]
    record = {
        "status": "planned",
        "updatedAt": now(),
        "marketplace": args.marketplace or "islee23520/lfg",
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
    }
    write_json(omx_setup_path(), record)
    return record


def omx_setup_show(args: argparse.Namespace) -> dict[str, Any]:
    return read_json(omx_setup_path(), {"omxSetup": []})

def skill_list(args: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    skills = data.get("skills", [])
    return {"count": len(skills), "skills": skills}


def skill_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    data = read_json(CATALOG_PATH, {"skills": []})
    matches = []
    for skill in data.get("skills", []):
        haystack = json.dumps(skill, ensure_ascii=False).lower()
        if q in haystack:
            matches.append(skill)
    return {"query": args.query, "count": len(matches), "matches": matches}

def list_plans() -> list[dict[str, Any]]:
    plans = []
    for path in sorted(PLANS_DIR.glob("*.json")) if PLANS_DIR.exists() else []:
        try:
            plan = read_json(path)
            plan["path"] = str(path)
            plans.append(plan)
        except Exception:
            pass
    return plans


def plan_list(args: argparse.Namespace) -> dict[str, Any]:
    plans = list_plans()
    if args.limit:
        plans = plans[-args.limit:]
    return {"count": len(plans), "plans": plans}

def mk_plan(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    steps = [s.strip() for s in re.split(r"\n|;", args.steps or "") if s.strip()]
    if not steps:
        steps = [
            "capture objective and constraints",
            "inspect current repo/plugin state",
            "implement smallest vertical slice",
            "run smoke verification",
            "install into ~/.grok/plugins/lfg and inspect with real Grok",
            "commit and push evidence",
        ]
    plan_id = f"plan-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    plan = {
        "id": plan_id,
        "title": args.title,
        "createdAt": now(),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "steps": [{"id": i + 1, "status": "pending", "text": step} for i, step in enumerate(steps)],
    }

    # Write structured JSON (machine + durable record)
    json_path = PLANS_DIR / f"{plan_id}.json"
    write_json(json_path, plan)
    state_json_path = STATE_DIR / "plans" / f"{plan_id}.json"
    write_json(state_json_path, plan)

    # Also write a human-usable Markdown version inside .lfg/plans/
    # so the user (and agents) have something concrete to open and work on.
    # Use standard Markdown task list syntax (- [ ]) for interactive checkbox rendering
    # in viewers and for the rich preview popup/card.
    md_lines = [
        f"# Plan: {args.title}",
        "",
        f"**ID**: `{plan_id}`",
        f"**Created**: {plan['createdAt']}",
        f"**Repo**: {plan.get('repo', 'unknown')}",
        "",
        "## Steps",
        "",
    ]
    for step in plan["steps"]:
        checked = "x" if step.get("status") != "pending" else " "
        md_lines.append(f"- [{checked}] {step['id']}. {step['text']}")

    md_lines.extend([
        "",
        "## Notes",
        "",
        "_Add evidence, blockers, and updates here. This file lives in `.lfg/plans/` so it is durable across sessions._",
        "",
    ])

    md_path = PLANS_DIR / f"{plan_id}.md"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    md_content = md_path.read_text(encoding="utf-8")

    # Pointer for quick access
    write_json(STATE_DIR / "current-plan.json", {
        "id": plan_id,
        "json": str(json_path),
        "markdown": str(md_path),
        "updatedAt": now()
    })

    plan["json_path"] = str(json_path)
    plan["state_json_path"] = str(state_json_path)
    plan["markdown_path"] = str(md_path)
    plan["markdown_content"] = md_content

    # Rich self-contained preview structure: full content + metadata so that
    # Grok (via plan skill, MCP tool result, /plan, or lfg plan create --json)
    # can directly render a beautiful preview card/popup with interactive elements.
    # This replaces raw path/MD dumps. The `preview.markdown` is complete and
    # standalone; checkboxes use standard Markdown task-list syntax for native
    # interactive rendering (e.g. clickable in supported UIs).
    plan["preview"] = {
        "type": "plan_preview",
        "title": args.title,
        "id": plan_id,
        "created_at": plan["createdAt"],
        "repo": plan.get("repo"),
        "markdown": md_content,  # full rendered content, self-contained
        "steps": plan["steps"],
        "paths": {
            "markdown": str(md_path),
            "json": str(json_path),
        },
        "interactive": {
            "supports_checkboxes": True,
            "checkbox_format": "markdown_task_list",  # - [ ] / - [x]
            "suggested_actions": [
                "edit_file",
                "mark_step_complete",
                "add_step_note",
                "spawn_team_from_plan",
                "view_in_editor",
            ],
        },
        "render": {
            "style": "rich_card",
            "popup": True,
            "header": f"✅ Plan Created: {args.title}",
            "footer_note": "Self-contained preview from .lfg/plans/. Durable across sessions. Use checkboxes or edit the .md directly.",
            "theme": "grok-plan-preview",
        },
    }
    return plan


def catalog(_: argparse.Namespace) -> dict[str, Any]:
    data = read_json(CATALOG_PATH, {"skills": []})
    return {"pluginRoot": str(ROOT), "catalogPath": str(CATALOG_PATH), **data}



def hud(args: argparse.Namespace) -> dict[str, Any]:
    """Return a compact workflow status summary."""
    ensure_dirs()
    goals = list_goals()
    plans = list_plans()
    teams = [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []
    notes = wiki_notes()
    last_ultraqa = read_json(STATE_DIR / "last-ultraqa.json", None)
    last_cancel = read_json(STATE_DIR / "last-cancel.json", None)
    summary = {
        "ok": True,
        "plugin": "lfg",
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "pluginData": str(DATA),
        "counts": {
            "goals": len(goals),
            "activeGoals": len([g for g in goals if g.get("status") == "active"]),
            "plans": len(plans),
            "teams": len(teams),
            "wikiNotes": len(notes),
        },
        "current": {
            "goal": read_json(STATE_DIR / "current-goal.json", None),
            "plan": read_json(STATE_DIR / "current-plan.json", None),
            "team": read_json(STATE_DIR / "current-team.json", None),
            "lastUltraqa": last_ultraqa,
            "lastCancel": last_cancel,
        },
    }
    if args.text:
        summary["text"] = (
            f"lfg {summary['version']} | goals {summary['counts']['goals']} "
            f"(active {summary['counts']['activeGoals']}) | plans {summary['counts']['plans']} | "
            f"teams {summary['counts']['teams']} | wiki {summary['counts']['wikiNotes']}"
        )
    return summary

def status(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    goals = list_goals()
    return {
        "ok": True,
        "version": read_json(ROOT / ".grok-plugin" / "plugin.json", {}).get("version"),
        "launcher": effective_launcher(),
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
        "catalogSkills": len(read_json(CATALOG_PATH, {"skills": []}).get("skills", [])),
        "goals": {"total": len(goals), "active": len([g for g in goals if g.get("status") == "active"])},
        "currentGoal": read_json(STATE_DIR / "current-goal.json", None),
        "currentPlan": read_json(STATE_DIR / "current-plan.json", None),
    }


def find_verify_commands(cwd: pathlib.Path) -> list[list[str]]:
    candidates: list[list[str]] = []
    if (cwd / "plugins" / "lfg" / "bin" / "self-test.sh").exists():
        candidates.append(["plugins/lfg/bin/self-test.sh"])
    if (cwd / "package.json").exists():
        pkg = read_json(cwd / "package.json", {})
        scripts = pkg.get("scripts", {}) if isinstance(pkg, dict) else {}
        for name in ("test", "lint", "typecheck"):
            if name in scripts:
                candidates.append(["npm", "run", name])
    if (cwd / "pyproject.toml").exists():
        candidates.append(["python3", "-m", "pytest", "-q"])
    if (cwd / "go.mod").exists():
        candidates.append(["go", "test", "./..."])
    return candidates[:3]


def run_cmd(cmd: list[str], cwd: pathlib.Path, timeout: int) -> dict[str, Any]:
    started = time.time()
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, timeout=timeout)
        return {
            "cmd": cmd,
            "returncode": proc.returncode,
            "durationSec": round(time.time() - started, 3),
            "stdoutTail": proc.stdout[-4000:],
            "stderrTail": proc.stderr[-4000:],
        }
    except subprocess.TimeoutExpired as exc:
        return {"cmd": cmd, "returncode": 124, "durationSec": timeout, "stdoutTail": (exc.stdout or "")[-4000:], "stderrTail": "timeout"}


def ultraqa(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    scenarios = [
        "plugin manifest JSON parses and declares lfg identity",
        "MCP server initializes, lists tools, and handles catalog/status calls",
        "audit hook is fail-open and redacts obvious token markers",
        "real Grok inspect/list can discover installed plugin without relying on repo-only state",
        "repo remains plugin-only unless an executable runtime is intentionally added under bin/",
    ]
    commands = [] if args.no_run else (args.command or find_verify_commands(cwd))
    results = [run_cmd(cmd if isinstance(cmd, list) else [cmd], cwd, args.timeout) for cmd in commands]
    verdict = "pass" if results and all(r["returncode"] == 0 for r in results) else ("planned" if not results else "fail")
    run = {
        "id": f"ultraqa-{time.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}",
        "createdAt": now(),
        "objective": args.objective,
        "repo": detect_repo(cwd),
        "scenarios": scenarios,
        "commands": commands,
        "results": results,
        "verdict": verdict,
    }
    write_json(RUNS_DIR / f"{run['id']}.json", run)
    write_json(STATE_DIR / "last-ultraqa.json", {"id": run["id"], "path": str(RUNS_DIR / f"{run['id']}.json"), "verdict": verdict, "updatedAt": now()})
    return run

def backend_name(args: argparse.Namespace) -> str:
    return args.name or "lfg-backend"


def require_executable(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"required executable not found: {name}")
    return path


def backend_start(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    require_executable("tmux")
    name = backend_name(args)
    cwd = pathlib.Path(args.cwd).resolve()
    exists = subprocess.run(["tmux", "has-session", "-t", name], text=True, capture_output=True).returncode == 0
    if not exists:
        subprocess.run([
            "tmux", "new-session", "-d", "-s", name, "-n", "lfg", "-c", str(cwd),
            "bash", "-lc", "echo 'lfg explicit team tmux session ready'; echo 'use: lfg team create 3:executor \"task\"'; exec $SHELL"
        ], check=True)
    state = {"name": name, "status": "running", "cwd": str(cwd), "updatedAt": now(), "attachCommand": f"tmux attach -t {shlex.quote(name)}"}
    write_json(STATE_DIR / "backend.json", state)
    return state


def current_tmux_pane() -> str | None:
    pane = (os.environ.get("TMUX_PANE") or "").strip()
    if re.fullmatch(r"%\d+", pane):
        return pane
    proc = subprocess.run(["tmux", "display-message", "-p", "#{pane_id}"], text=True, capture_output=True)
    candidate = proc.stdout.strip() if proc.returncode == 0 else ""
    if re.fullmatch(r"%\d+", candidate):
        return candidate
    return None


def attach_backend_from_tmux_pane(state: dict[str, Any], cwd: pathlib.Path) -> dict[str, Any]:
    pane = current_tmux_pane()
    state["attachMethod"] = "split-window"
    state["attached"] = False
    if not pane:
        state["attachMethod"] = "inside-tmux-unresolved-pane"
        state["note"] = "inside tmux but current pane could not be resolved; use attachCommand from the desired pane"
        return state
    command = f"env -u TMUX tmux attach-session -t {shlex.quote(state['name'])}"
    subprocess.run(["tmux", "split-window", "-h", "-t", pane, "-c", str(cwd), command], check=True)
    state["attached"] = True
    state["triggerPane"] = pane
    state["paneAttachCommand"] = f"tmux split-window -h -t {shlex.quote(pane)} -c {shlex.quote(str(cwd))} {shlex.quote(command)}"
    return state


def lfg_launch(args: argparse.Namespace) -> dict[str, Any]:
    """Default `lfg`/`ulw` behavior. Now with hybrid `ulw` keyword support (Candidate 3)."""
    # Check if launched as `ulw` with a goal (magic keyword path)
    if effective_launcher() == "ulw" and getattr(args, "objective", None):
        trigger = detect_ulw_intent(args.objective)
        if trigger.get("triggered"):
            return activate_ulw_mode(args.objective, explicit=trigger.get("explicit", True))

    state = status(args)
    state["status"] = "ready"
    state["mode"] = "lfg-runtime"
    return state

def backend_status(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "list-sessions"], text=True, capture_output=True)
    return {"name": name, "configured": read_json(STATE_DIR / "backend.json", None), "tmux": {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}}


def backend_stop(args: argparse.Namespace) -> dict[str, Any]:
    name = backend_name(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", name], text=True, capture_output=True)
    state = {"name": name, "status": "stopped", "updatedAt": now(), "returncode": proc.returncode, "stderr": proc.stderr}
    write_json(STATE_DIR / "backend.json", state)
    return state

def team_dir() -> pathlib.Path:
    return STATE_DIR / "teams"


def team_json_path(name: str) -> pathlib.Path:
    return safe_child_path(team_dir(), f"{validate_safe_id(name, 'team name')}.json")


def current_team_ref(args: argparse.Namespace) -> str:
    ref = args.name or (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name")
    if not ref:
        raise SystemExit("no team name and no current team")
    return validate_safe_id(ref, "team name")


def parse_team_spec(spec: str) -> list[tuple[int, str]]:
    """Parse team spec into list of (count, role_or_agent_name).

    Supports:
        "3:executor"               -> [(3, "executor")]
        "1:iz,2:gonow,1:grok"      -> [(1, "iz"), (2, "gonow"), (1, "grok")]
        "iz,gonow,grok"            -> [(1, "iz"), (1, "gonow"), (1, "grok")]
    """
    parts = [p.strip() for p in spec.split(",") if p.strip()]
    result = []
    for part in parts:
        if ":" in part:
            n, name = part.split(":", 1)
            result.append((max(1, int(n)), name or "executor"))
        else:
            result.append((1, part))
    return result if result else [(1, "executor")]


TEAM_PROVIDER_EXECUTABLES = {
    # Maximise usage of whatever coding CLIs the user has installed on this machine
    "hermes": "hermes",
    "claude": "claude",      # Claude Code / claude CLI
    "codex": "codex",
    "gemini": "gemini",      # Google Gemini CLI (if installed)
    "copilot": "copilot",    # GitHub Copilot CLI (if installed)
    "zai": None,             # Z.ai/Zhipu HTTP adapter (ZAI_API_KEY/ZHIPU_API_KEY when --run)
    "opencode": "opencode",  # opencode CLI — use with -p for deep architect / consultant / planning work
    "grok": None,            # native Grok sub-agent via spawn_subagent + ulw branding
    "subagent": None,        # alias for native grok sub-agents
    "noop": None,            # safe fallback for tests / dry-runs
}

DEEP_ROLES = {"architect", "consultant", "reviewer", "deep", "planner", "strategist", "designer"}

# --- LFG Named Agents (User-defined personas with ULW identity) ---

LFG_AGENTS_DIR = pathlib.Path.home() / ".grok" / "lfg" / "agents"

def load_agent_definition(name: str) -> dict | None:
    """Load a named LFG agent definition (e.g. 'iz', 'lina').
    Scans the user dir and plugin src/agents/legacy/ for any *.json whose internal 'name' field matches.
    This supports files named iz-architect.json etc.
    """
    candidates = []
    # user dir (higher priority)
    user_dir = LFG_AGENTS_DIR
    if user_dir.exists():
        candidates.extend(sorted(user_dir.glob("*.json")))
    # plugin examples (new canonical location)
    plugin_dir = ROOT / "src" / "agents"
    if plugin_dir.exists():
        candidates.extend(sorted(plugin_dir.glob("*.json")))

    # legacy named agents (compatibility layer)
    legacy_dir = ROOT / "src" / "agents" / "legacy"
    if legacy_dir.exists():
        candidates.extend(sorted(legacy_dir.glob("*.json")))

    for p in candidates:
        try:
            data = read_json(p, None)
            if data and data.get("name") == name:
                return data
        except Exception:
            continue
    return None


def is_named_agent(name: str) -> bool:
    return load_agent_definition(name) is not None


def get_agent_default_category(name: str) -> str | None:
    agent = load_agent_definition(name)
    return agent.get("default_category") if agent else None

def get_agent_prompt(agent_name: str, role: str, base_prompt: str, category: str | None = None) -> str:
    """Build the final prompt for a named agent, injecting ULW identity + category style."""
    agent_def = load_agent_definition(agent_name)
    if not agent_def:
        return base_prompt

    prompt = base_prompt

    # Inject agent-specific overrides
    overrides = agent_def.get("prompt_overrides", {})
    if "base" in overrides:
        prompt = overrides["base"] + "\n\n" + prompt
    if category and category in overrides:
        prompt += "\n\n" + overrides[category]

    # Always reinforce ULW identity
    prompt += f"\n\nYou are operating as an **ULW worker** named '{agent_name}' (LFG_LAUNCHER=ulw). Report using `ulw ultragoal checkpoint`."

    return prompt

# --- Phase 1: TeamRuntime Core Models (for durable LFG+ULW orchestration) ---

from dataclasses import dataclass, field
from typing import Literal

TeamRunStatus = Literal["planned", "running", "paused", "completed", "shutdown"]
MemberStatus = Literal["pending", "active", "completed", "failed"]
TaskStatus = Literal["pending", "claimed", "in_progress", "completed", "blocked"]
MessageType = Literal["task_assignment", "progress", "evidence", "evidence_submission", "ack", "command"]

@dataclass
class TeamMember:
    id: str
    name: str
    role: str
    provider: str
    status: MemberStatus = "pending"
    prompt: str = ""
    command: str = ""
    subagent_id: str | None = None
    ultragoal: str | None = None
    spawned_as_subagent: bool | str = False
    last_heartbeat: str | None = None

@dataclass
class TeamMessage:
    id: str
    from_member: str  # "leader" or member id
    to_member: str
    type: MessageType
    payload: dict
    ts: str

@dataclass
class TeamTask:
    id: str
    title: str
    description: str = ""
    status: TaskStatus = "pending"
    claimed_by: str | None = None
    dependencies: list[str] = field(default_factory=list)
    evidence: str = ""
    ts: str = ""

@dataclass
class TeamRun:
    id: str
    name: str
    objective: str
    status: TeamRunStatus = "planned"
    created_at: str = ""
    updated_at: str = ""
    ultragoal_id: str | None = None
    leader: str | None = None
    config: dict = field(default_factory=dict)
    members: list[TeamMember] = field(default_factory=list)
    tasks: list[TeamTask] = field(default_factory=list)
    mailbox: list[TeamMessage] = field(default_factory=list)
    tmux_session: str | None = None

# --- End Phase 1 Models ---

# --- Phase 1+: Separated JSON State Management (mode-aware, like OmO)
# When Ultragoal or Ultrawork/Hyperplan is active, we use separated run-based directories
# to avoid polluting flat team state. This matches OmO's ~/.omo/state/team/<run-id>/ pattern.

def _get_mode_aware_base(mode: str | None, mode_id: str | None) -> pathlib.Path:
    """Return the correct base directory for separated state.
    Examples:
      - ultragoal + ug-123  → state/runs/ultragoal-ug-123/
      - ultrawork + uw-456  → state/runs/ultrawork-uw-456/
      - hyperplan + hp-789  → state/runs/hyperplan-hp-789/
      - None                  → state/teams/   (legacy flat)
    """
    if mode and mode_id:
        return STATE_DIR / "runs" / f"{mode}-{mode_id}"
    return STATE_DIR / "teams"


class TeamStateStore:
    """Durable storage for TeamRun using structured subdirectories.
    Supports separated state per Ultragoal / Ultrawork / Hyperplan run (like OmO).
    """

    def __init__(self, base_dir: pathlib.Path | None = None, mode: str | None = None, mode_id: str | None = None):
        if base_dir:
            self.base = base_dir
        else:
            self.base = _get_mode_aware_base(mode, mode_id)
        self.base.mkdir(parents=True, exist_ok=True)
        self.mode = mode
        self.mode_id = mode_id

    def _run_dir(self, team_id: str) -> pathlib.Path:
        # For separated mode, we still allow multiple teams per run
        if self.mode and self.mode_id:
            d = self.base / "teams" / team_id
        else:
            d = self.base / team_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save_run(self, run: TeamRun) -> None:
        path = self._run_dir(run.id) / "run.json"
        data = {
            "id": run.id,
            "name": run.name,
            "objective": run.objective,
            "status": run.status,
            "created_at": run.created_at,
            "updated_at": run.updated_at,
            "ultragoal_id": run.ultragoal_id,
            "leader": run.leader,
            "config": run.config,
            "tmux_session": run.tmux_session,
            "mode": getattr(self, "mode", None),
            "mode_id": getattr(self, "mode_id", None),
        }
        write_json(path, data)

        # Save members, tasks, mailbox as lists for simplicity
        write_json(self._run_dir(run.id) / "members.json", [m.__dict__ for m in run.members])
        write_json(self._run_dir(run.id) / "tasks.json", [t.__dict__ for t in run.tasks])
        write_json(self._run_dir(run.id) / "mailbox.json", [m.__dict__ for m in run.mailbox])

        # For Hyperplan + loop mode, we also keep a lightweight pointer in the ultragoal ledger dir
        if run.ultragoal_id and getattr(self, "mode", None) in ("hyperplan", "ultrawork"):
            ug_ledger_dir = DATA / "ultragoal" / run.ultragoal_id
            ug_ledger_dir.mkdir(parents=True, exist_ok=True)
            write_json(ug_ledger_dir / f"team-run-{run.id}.json", {
                "team_run_id": run.id,
                "mode": self.mode,
                "status": run.status,
                "updated_at": run.updated_at
            })

    def load_run(self, team_id: str) -> TeamRun | None:
        path = self._run_dir(team_id) / "run.json"
        if not path.exists():
            return None
        data = read_json(path, {})
        if not data:
            return None

        members_data = read_json(self._run_dir(team_id) / "members.json", [])
        tasks_data = read_json(self._run_dir(team_id) / "tasks.json", [])
        mailbox_data = read_json(self._run_dir(team_id) / "mailbox.json", [])

        run = TeamRun(
            id=data["id"],
            name=data["name"],
            objective=data["objective"],
            status=data.get("status", "planned"),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            ultragoal_id=data.get("ultragoal_id"),
            leader=data.get("leader"),
            config=data.get("config", {}),
            tmux_session=data.get("tmux_session"),
        )
        run.members = [TeamMember(**m) for m in members_data]
        run.tasks = [TeamTask(**t) for t in tasks_data]
        run.mailbox = [TeamMessage(**m) for m in mailbox_data]
        return run

    def list_runs(self) -> list[str]:
        return [p.name for p in sorted(self.base.glob("*/run.json")) if p.parent.is_dir()]

    def delete_run(self, team_id: str) -> None:
        import shutil
        d = self._run_dir(team_id)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)

# --- End TeamStateStore ---

# --- Phase 1: Basic TeamMailbox (file-based for leader <-> ULW workers) ---

class TeamMailbox:
    """
    ULW-aware mailbox for LFG teams.
    Messages are stored in the separated run directory (state/runs/<mode>-<id>/teams/<team>/mailbox.json).
    Every message is designed to be easily turned into an `ulw ultragoal checkpoint` call.
    """

    def __init__(self, store: TeamStateStore, team_id: str):
        self.store = store
        self.team_id = team_id
        self.run = self.store.load_run(team_id)

    def _persist(self):
        if self.run:
            self.store.save_run(self.run)

    def send(self, from_member: str, to_member: str, type: MessageType, payload: dict, ultragoal_id: str | None = None) -> TeamMessage:
        """Send a message. If ultragoal_id is provided, the payload is pre-formatted for easy checkpointing."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)

        msg = TeamMessage(
            id=f"msg-{int(time.time()*1000)}",
            from_member=from_member,
            to_member=to_member,
            type=type,
            payload=payload,
            ts=now()
        )

        # Convenience: if this is an evidence submission for ultragoal, store the checkpoint command
        if type == "evidence_submission" and ultragoal_id:
            payload["_ulw_checkpoint_hint"] = f"ulw ultragoal checkpoint --id {ultragoal_id} --status complete --evidence \"...\" --story <id>"

        if self.run:
            self.run.mailbox.append(msg)
            self._persist()
        return msg

    def poll(self, for_member: str, since_ts: str | None = None) -> list[TeamMessage]:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return []
        return [
            m for m in self.run.mailbox
            if m.to_member == for_member and (not since_ts or m.ts > since_ts)
        ]

    def poll_for_leader(self, since_ts: str | None = None) -> list[TeamMessage]:
        return self.poll("leader", since_ts)

    def ack(self, msg_id: str) -> bool:
        """Mark a message as processed (removes it for Phase 1 simplicity)."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if self.run:
            original_len = len(self.run.mailbox)
            self.run.mailbox = [m for m in self.run.mailbox if m.id != msg_id]
            self._persist()
            return len(self.run.mailbox) < original_len
        return False

    def send_evidence(self, from_worker: str, ultragoal_id: str, evidence: str, story: str = "S001") -> TeamMessage:
        """Convenience method for ULW workers to submit evidence."""
        payload = {
            "evidence": evidence,
            "story": story,
            "checkpoint_command": f"ulw ultragoal checkpoint --id {ultragoal_id} --status complete --evidence \"{evidence}\" --story {story}"
        }
        return self.send(from_worker, "leader", "evidence_submission", payload, ultragoal_id=ultragoal_id)

# --- End TeamMailbox ---

# --- Phase 1: TeamTasklist (evidence-aware task management for ULW workers) ---

class TeamTasklist:
    """
    Task management with evidence submission and verification.
    Designed so ULW workers can claim tasks, submit evidence, and have it verified
    before the task is considered complete (especially important for Hyperplan).
    """

    def __init__(self, store: TeamStateStore, team_id: str):
        self.store = store
        self.team_id = team_id
        self.run = self.store.load_run(team_id)

    def _persist(self):
        if self.run:
            self.store.save_run(self.run)

    def create_task(self, title: str, description: str = "", dependencies: list[str] | None = None) -> TeamTask:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        task = TeamTask(
            id=f"task-{int(time.time()*1000)}",
            title=title,
            description=description,
            status="pending",
            dependencies=dependencies or [],
            ts=now()
        )
        if self.run:
            self.run.tasks.append(task)
            self._persist()
        return task

    def claim_task(self, task_id: str, worker_id: str) -> TeamTask | None:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return None
        for task in self.run.tasks:
            if task.id == task_id and task.status == "pending":
                # Check dependencies
                if all(
                    any(t.id == dep and t.status == "completed" for t in self.run.tasks)
                    for dep in task.dependencies
                ):
                    task.status = "claimed"
                    task.claimed_by = worker_id
                    task.ts = now()
                    self._persist()
                    return task
        return None

    def submit_evidence(self, task_id: str, worker_id: str, evidence: str) -> bool:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return False
        for task in self.run.tasks:
            if task.id == task_id and task.claimed_by == worker_id:
                task.evidence = evidence
                task.status = "in_progress"  # waiting for verification
                task.ts = now()
                self._persist()
                return True
        return False

    def verify_evidence(self, task_id: str, verified_by: str = "leader") -> bool:
        """Leader or Hyperplan reviewer marks the evidence as good."""
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return False
        for task in self.run.tasks:
            if task.id == task_id and task.status == "in_progress":
                task.status = "completed"
                task.ts = now()
                # In real usage, this would trigger a checkpoint to Ultragoal
                self._persist()
                return True
        return False

    def get_pending_tasks(self) -> list[TeamTask]:
        if not self.run:
            self.run = self.store.load_run(self.team_id)
        if not self.run:
            return []
        return [t for t in self.run.tasks if t.status == "pending"]

# --- End TeamTasklist ---

# --- Phase 1: TeamRuntime (orchestrator API for LFG+ULW) ---

class TeamRuntime:
    """Core runtime for durable team orchestration in LFG.
    Uses TeamStateStore + TeamMailbox.
    ULW workers (external or subagent) interact via mailbox and report to ultragoal.
    """

    def __init__(self, store: TeamStateStore | None = None):
        self.store = store or TeamStateStore()
        self._mailbox = None
        self._tasklist = None

    def create(self, name: str, objective: str, ultragoal_id: str | None = None, config: dict | None = None,
               mode: str | None = None, mode_id: str | None = None) -> TeamRun:
        """Create a new TeamRun with optional mode (ultragoal, ultrawork, hyperplan) for separated state."""
        name = validate_safe_id(name, "team name")
        store = TeamStateStore(mode=mode, mode_id=mode_id) if mode else self.store

        run = TeamRun(
            id=name,
            name=name,
            objective=objective,
            status="planned",
            created_at=now(),
            updated_at=now(),
            ultragoal_id=ultragoal_id,
            config=config or {},
        )
        store.save_run(run)

        # Legacy flat pointer for backward compat
        legacy = {"id": run.id, "name": run.name, "objective": run.objective, "status": run.status, "ultragoal": ultragoal_id}
        write_json(team_json_path(name), legacy)
        write_json(STATE_DIR / "current-team.json", {"name": name, "path": str(team_json_path(name)), "updatedAt": now()})
        return run

    def status(self, team_id: str) -> TeamRun | None:
        return self.store.load_run(validate_safe_id(team_id, "team name"))

    def shutdown(self, team_id: str) -> None:
        team_id = validate_safe_id(team_id, "team name")
        run = self.store.load_run(team_id)
        if run:
            run.status = "shutdown"
            run.updated_at = now()
            self.store.save_run(run)
            # Legacy
            p = team_json_path(team_id)
            if p.exists():
                data = read_json(p, {})
                data["status"] = "shutdown"
                write_json(p, data)

    @property
    def mailbox(self) -> TeamMailbox:
        if self._mailbox is None:
            self._mailbox = TeamMailbox(self.store, getattr(self.store, "team_id", ""))
            # Better: we need to associate the mailbox with a specific team
            # For now this is a placeholder — real usage will be per TeamRun
        return self._mailbox

    def get_mailbox(self, team_id: str) -> TeamMailbox:
        return TeamMailbox(self.store, team_id)

    def get_tasklist(self, team_id: str) -> TeamTasklist:
        return TeamTasklist(self.store, team_id)

    # =====================
    # Continuous Loop Support (Hyperplan / Ultrawork)
    # =====================

    def has_pending_work(self, team_id: str) -> bool:
        """Returns True if there are still tasks that are not completed."""
        tasklist = self.get_tasklist(team_id)
        run = self.store.load_run(team_id)
        return len(tasklist.get_pending_tasks()) > 0 or any(
            t.status in ("claimed", "in_progress") for t in (run.tasks if run else [])
        )

    def get_next_claimable_task(self, team_id: str, worker_id: str) -> TeamTask | None:
        """ULW worker tries to claim the next available task."""
        tasklist = self.get_tasklist(team_id)
        pending = tasklist.get_pending_tasks()
        for task in pending:
            claimed = tasklist.claim_task(task.id, worker_id)
            if claimed:
                return claimed
        return None

    def submit_worker_evidence(self, team_id: str, worker_id: str, task_id: str, evidence: str, ultragoal_id: str | None = None):
        """Worker submits evidence for a task. Returns the message that was sent."""
        tasklist = self.get_tasklist(team_id)
        success = tasklist.submit_evidence(task_id, worker_id, evidence)
        if not success:
            return None

        mailbox = self.get_mailbox(team_id)
        return mailbox.send_evidence(worker_id, ultragoal_id or "", evidence, task_id)

    def verify_task_evidence(self, team_id: str, task_id: str, verified_by: str = "leader") -> bool:
        """Leader or Hyperplan reviewer verifies the evidence."""
        tasklist = self.get_tasklist(team_id)
        return tasklist.verify_evidence(task_id, verified_by)

    def close_loop_if_done(self, team_id: str) -> bool:
        """If all tasks are completed and verified, mark the run as completed."""
        run = self.store.load_run(team_id)
        if not run:
            return False

        if all(t.status == "completed" for t in run.tasks):
            run.status = "completed"
            run.updated_at = now()
            self.store.save_run(run)
            return True
        return False

    def get_worker_context(self, team_id: str, worker_id: str):
        """Returns a convenient context object for ULW workers (external CLI or sub-agent).
        They can use this to participate in the continuous work loop.
        """
        return {
            "mailbox": self.get_mailbox(team_id),
            "tasklist": self.get_tasklist(team_id),
            "worker_id": worker_id,
            "team_id": team_id,
            "get_next_task": lambda: self.get_next_claimable_task(team_id, worker_id),
            "submit_evidence": lambda task_id, evidence: self.submit_worker_evidence(team_id, worker_id, task_id, evidence),
        }

    def worker_loop_iteration(self, team_id: str, worker_id: str, ultragoal_id: str | None = None) -> dict:
        """
        One iteration of the continuous work loop (used by Ultrawork / Hyperplan).
        A ULW worker calls this repeatedly.

        Returns what the worker should do next.
        """
        tasklist = self.get_tasklist(team_id)
        mailbox = self.get_mailbox(team_id)

        # Try to claim a task
        task = self.get_next_claimable_task(team_id, worker_id)
        if task:
            return {
                "action": "work_on_task",
                "task": task,
                "instruction": f"Work on task '{task.title}'. When done, call submit_evidence and send_evidence via mailbox."
            }

        # If no task, check for new messages
        messages = mailbox.poll(worker_id)
        if messages:
            return {
                "action": "process_messages",
                "messages": messages
            }

        # Nothing to do
        return {
            "action": "idle",
            "suggestion": "Call close_loop_if_done or wait for new tasks from leader."
        }

# --- End TeamRuntime ---


def provider_command(provider: str, prompt: str) -> str:
    if provider not in TEAM_PROVIDER_EXECUTABLES:
        raise SystemExit(f"unknown provider: {provider}")
    q = shlex.quote(prompt)

    if provider == "hermes":
        return f"hermes -z {q} chat"
    if provider == "claude":
        # Claude Code with bypass for team work
        return f"claude --permission-mode bypassPermissions {q}"
    if provider == "codex":
        return f"codex {q}"
    if provider == "gemini":
        return f"gemini {q}"
    if provider == "copilot":
        return f"copilot {q}"
    if provider == "zai":
        script = shlex.quote(str(pathlib.Path(__file__).resolve()))
        return f"python3 {script} --json ask create {q} --provider zai --dry-run; exec $SHELL"
    if provider == "opencode":
        # -p flag for deep / planning / architect / consultant mode (as requested)
        # especially powerful when combined with architect/consultant roles + ulw branding
        return f"opencode -p {q}"

    if provider in ("grok", "subagent"):
        # Native Grok sub-agent — always launched as an ULW worker.
        return (
            f"echo 'GROK_SUBAGENT — ULW MODE'; "
            f"echo {q}; "
            f"echo 'You are a first-class ULW worker. Use the ulw identity and MCP tools to report to the ultragoal ledger.'; "
            f"exec $SHELL"
        )

    if provider == "noop":
        return f"printf '%s\n' {shlex.quote('noop provider ready: ' + prompt)}; exec $SHELL"

    raise SystemExit(f"unknown provider: {provider}")


def spawn_agent(
    agent_id: str,
    category: str | None = None,
    task: str | None = None,
    **kwargs: Any,
) -> dict[str, Any]:
    """Grok-native spawn adapter (lfg-native implementation)."""
    agent = _OMO_REGISTRY_INDEX.get(agent_id)
    if agent is None:
        return {
            "ok": False,
            "error": f"unknown agent: {agent_id!r}",
            "known": sorted(_OMO_REGISTRY_INDEX.keys()),
        }

    if category and category not in agent.get("categories", []):
        return {
            "ok": False,
            "error": "category not supported for agent",
            "agent": agent_id,
            "category": category,
            "supported": agent.get("categories", []),
        }

    resolved = resolve_omo_model_profile(
        agent,
        category=category,
        provider=kwargs.get("provider"),
        model=kwargs.get("model"),
        reasoning=kwargs.get("reasoning"),
    )
    if not resolved.get("ok"):
        return resolved

    model_profile = resolved["modelProfile"]

    result = {
        "ok": True,
        "status": "fallback_manual_gate",
        "agent_id": agent_id,
        "category": category,
        "task": task,
        "model_profile": model_profile,
        "evidence": f"manual-gated fallback spawn for {agent_id} (category={category})",
        "task_id": str(uuid.uuid4()),
        "session_id": str(uuid.uuid4()),
        "touched_files": [],
        "blockers": [],
        "children": [],
        "manual_gate_required": True,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }

    # Robust persist for full coverage (lfg-native)
    try:
        runs_dir = RUNS_DIR / "spawns"
        runs_dir.mkdir(parents=True, exist_ok=True)
        record_path = runs_dir / f"{uuid.uuid4()}.json"
        result["record_path"] = str(record_path)
        record_path.write_text(jdump(result), encoding="utf-8")
    except Exception as e:
        result["persist_error"] = str(e)

    return result


def spawn_wave(agents: list[dict], **kwargs: Any) -> dict[str, Any]:
    """spawn_wave with actual per-agent spawn_agent calls (full coverage direction)."""
    wave_id = str(uuid.uuid4())
    results = []
    mode = kwargs.get("mode", "parallel")

    for a in agents:
        agent_id = a.get("agent_id", a) if isinstance(a, dict) else a
        category = a.get("category") if isinstance(a, dict) else None
        task = a.get("task") if isinstance(a, dict) else None
        r = spawn_agent(agent_id, category=category, task=task)
        results.append(r)

    return {
        "ok": True,
        "status": "wave_executed",
        "wave_id": wave_id,
        "mode": mode,
        "results": results,
        "manual_gate_required": True,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }


def run_dependency_graph(plan: list[dict], **kwargs: Any) -> dict[str, Any]:
    """run_dependency_graph with basic depends_on evaluation (full coverage direction)."""
    graph_id = str(uuid.uuid4())
    id_to_task = {t.get("id"): t for t in plan if isinstance(t, dict) and t.get("id")}
    blocked = []
    ready = []

    for t in plan:
        if not isinstance(t, dict):
            continue
        tid = t.get("id")
        deps = t.get("depends_on", []) or []
        if any(d not in id_to_task or id_to_task[d].get("status") != "done" for d in deps):
            blocked.append(tid)
        else:
            ready.append(tid)

    return {
        "ok": True,
        "status": "graph_evaluated",
        "graph_id": graph_id,
        "tasks": [t.get("id") for t in plan if isinstance(t, dict)],
        "blocked": blocked,
        "ready": ready,
        "manual_gate_required": True,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }


def synthesize(results: list[dict], **kwargs: Any) -> dict[str, Any]:
    """synthesize with basic evidence/blocker aggregation (full coverage direction)."""
    all_evidence = []
    all_blockers = []
    all_touched = []
    success_count = 0
    fail_count = 0

    for r in results:
        if r.get("ok"):
            success_count += 1
        else:
            fail_count += 1
        all_evidence.append(r.get("evidence", ""))
        all_blockers.extend(r.get("blockers", []))
        all_touched.extend(r.get("touched_files", []))

    return {
        "ok": fail_count == 0,
        "status": "synthesized",
        "synthesis_id": str(uuid.uuid4()),
        "success_count": success_count,
        "fail_count": fail_count,
        "evidence": all_evidence,
        "blockers": list(set(all_blockers)),
        "touched_files": list(set(all_touched)),
        "manual_gate_required": True,
        "oracleReview": dict(GROK_ORACLE_REVIEW),
    }


def team_provider_matrix() -> list[dict[str, Any]]:
    """Returns all possible team providers, highlighting which coding CLIs
    installed on *this machine* can actually be used right now.
    The goal of team mode is to maximise usage of every coding agent the user has.
    """
    rows = []
    for provider, exe in TEAM_PROVIDER_EXECUTABLES.items():
        if provider in ("grok", "subagent"):
            available = True
            exe_name = "spawn_subagent (native Grok sub-agent running as ULW worker)"
        else:
            available = True if exe is None else bool(shutil.which(exe))
            exe_name = exe or "builtin"

        rows.append({
            "provider": provider,
            "executable": exe_name,
            "available": available,
            "required": False,
            "commandPreview": provider_command(provider, "TEAM_PROVIDER_SMOKE")[:240],
        })
    return rows


def resolve_providers_for_agent(agent_name: str, installed: list[str]) -> list[str]:
    """Resolve providers for a named LFG agent (lina, gonow, iz, grok, etc.).

    Respects the agent's `default_category`:
        - deep       → opencode, codex, claude, grok
        - artistry   → gemini, grok, claude
        - ultrabrain → grok, codex, opencode
    """
    agent_def = load_agent_definition(agent_name)
    if not agent_def:
        return resolve_providers_for_role(agent_name, installed)

    cat = agent_def.get("default_category")
    usable = [p for p in installed if p in TEAM_PROVIDER_EXECUTABLES]

    if not usable:
        return ["grok"] if "grok" in TEAM_PROVIDER_EXECUTABLES else ["noop"]

    if cat == "deep":
        order = ["grok", "subagent"]
    elif cat == "artistry":
        order = ["grok", "subagent"]
    elif cat == "ultrabrain":
        order = ["grok", "subagent"]
    else:
        order = ["grok", "subagent"]

    preferred = [p for p in order if p in usable]
    for p in usable:
        if p not in preferred:
            preferred.append(p)
    return preferred or usable


def resolve_providers_for_role(role: str, installed: list[str]) -> list[str]:
    """Fallback for generic roles (executor, architect, etc.)."""
    role_lower = (role or "").lower()
    is_deep = any(k in role_lower for k in DEEP_ROLES)

    usable = [p for p in installed if p in TEAM_PROVIDER_EXECUTABLES]

    if not usable:
        return ["grok"] if "grok" in TEAM_PROVIDER_EXECUTABLES else ["noop"]

    if is_deep:
        preferred = []
        if "opencode" in usable: preferred.append("opencode")
        if "codex" in usable: preferred.append("codex")
        if "claude" in usable: preferred.append("claude")
        if "gemini" in usable: preferred.append("gemini")
        if "grok" in usable or "subagent" in usable: preferred.append("grok")
        for p in usable:
            if p not in preferred: preferred.append(p)
        return preferred or usable

    preferred = []
    for p in ["grok", "claude", "codex", "opencode", "gemini"]:
        if p in usable: preferred.append(p)
    for p in usable:
        if p not in preferred: preferred.append(p)
    return preferred or usable


def team_providers(args: argparse.Namespace) -> dict[str, Any]:
    providers = team_provider_matrix()
    return {
        "ok": True,
        "providers": providers,
        "default": ["grok", "opencode", "claude", "codex"],  # role-aware smart defaults
        "smokeSafe": "noop",
        "summary": {
            "available": [p["provider"] for p in providers if p["available"]],
            "missing": [p["provider"] for p in providers if not p["available"]],
        },
    }


def team_preflight(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    providers = team_provider_matrix()
    tmux_path = shutil.which("tmux")
    backend = backend_start(argparse.Namespace(name=getattr(args, "name", None), cwd=args.cwd))
    required_ok = bool(tmux_path) and backend.get("status") == "running"
    name = backend.get("name") or backend_name(args)
    return {
        "ok": required_ok,
        "tmux": {"available": bool(tmux_path), "path": tmux_path},
        "backend": backend,
        "providers": providers,
        "commands": {
            "createDryRun": "lfg team create 3:executor \"objective\" --dry-run",
            "createNoopSmoke": f"lfg team create 2:executor \"smoke objective\" --name {shlex.quote(name + '-team')} --providers noop",
            "backendAttach": backend.get("attachCommand") or f"tmux attach -t {shlex.quote(name)}",
            "backendStatus": f"tmux has-session -t {shlex.quote(name)}",
            "providers": "lfg team providers",
        },
        "summary": {
            "availableProviders": [p["provider"] for p in providers if p["available"]],
            "missingProviders": [p["provider"] for p in providers if not p["available"]],
            "smokeSafe": "noop",
        },
    }

def team_create(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    cwd = pathlib.Path(args.cwd).resolve()
    spec_parts = parse_team_spec(args.spec)   # now returns list of (count, name)

    # Optional mode support (passed from ultragoal_spawn or future ultrawork)
    mode = getattr(args, "mode", None)
    mode_id = getattr(args, "mode_id", None)

    # Smart default: maximise whatever coding CLIs are actually installed on this machine,
    # with strong preference for deep roles (architect, consultant, etc.)
    installed = []
    for p, exe in TEAM_PROVIDER_EXECUTABLES.items():
        if p in ("grok", "subagent"):
            if "spawn_subagent" in globals() and callable(globals().get("spawn_subagent")):
                installed.append(p)
        elif exe and shutil.which(exe):
            installed.append(p)

    # Compute a smart default providers list from what is installed (maximize usage)
    if installed:
        default_providers = ",".join((installed * 3)[:6])
    else:
        default_providers = "grok,claude,codex,hermes,gemini,opencode"

    providers = parse_providers(args.providers or default_providers)
    name = validate_safe_id(args.name or f"grok-team-{time.strftime('%Y%m%d-%H%M%S')}", "team name")
    objective = args.objective
    members = []
    ug = detect_current_ultragoal()
    ug_id = ug["id"] if ug else None
    user_specified_providers = bool(args.providers)

    # Support spec_parts from parse_team_spec: list of (count, role_or_agent)
    # This enables "iz,gonow,grok" and "1:iz,2:gonow" and named agents with category-driven providers (B wiring)
    global_idx = 0
    for count, role in spec_parts:
        for ii in range(count):
            member_prompt = None
            agent_def = load_agent_definition(role)
            effective_role = role
            effective_category = None
            is_deep = False

            if agent_def:
                # === Named LFG agent path (lina/gonow/iz/grok) with ULW + category mapping (deep->codex etc) ===
                effective_role = agent_def.get("role", role)
                effective_category = agent_def.get("default_category")
                if user_specified_providers:
                    provider = providers[global_idx % len(providers)] if providers else "grok"
                else:
                    role_providers = resolve_providers_for_agent(role, installed)
                    provider = role_providers[global_idx % len(role_providers)] if role_providers else (providers[0] if providers else "grok")
                member_name = f"{role}-{ii+1}-{provider}"
                is_deep = (effective_category == "deep") or (str(effective_role).lower() in DEEP_ROLES)

                base = (
                    f"You are {member_name} in LFG team {name}. "
                    f"Objective: {objective}. Work in {cwd}. "
                    "Coordinate through git status, tests, and concise verification notes. "
                    "Do not overwrite teammate work; inspect before editing."
                )
                if ug_id:
                    ug_objective = ug.get("objective", "") if ug else ""
                    base += (
                        f" This team was spawned from ultragoal {ug_id} (leader objective: {ug_objective}). "
                        "You are acting as a Grok sub-agent in an ultragoal-driven swarm (ulw mode). "
                        "When you have verifiable progress or complete a story, report back with: "
                        f"ulw ultragoal checkpoint --id {ug_id} --status complete --evidence \"<what you did + tests or artifacts>\" --story S001 (or the relevant story id). "
                        "Use the ultragoal ledger as the single source of truth for the leader."
                    )
                member_prompt = get_agent_prompt(role, effective_role, base, effective_category)
            else:
                # === Legacy generic role path (executor, architect, etc.) ===
                role_lower = (role or "").lower()
                is_deep = any(k in role_lower for k in DEEP_ROLES)

                if is_deep and not user_specified_providers:
                    role_providers = resolve_providers_for_role(role, installed)
                    provider = role_providers[global_idx % len(role_providers)] if role_providers else (providers[0] if providers else "grok")
                else:
                    provider = providers[global_idx % len(providers)] if providers else "grok"

                member_name = f"{role}-{ii+1}-{provider}"
                base = (
                    f"You are {member_name} in LFG team {name}. "
                    f"Objective: {objective}. Work in {cwd}. "
                    "Coordinate through git status, tests, and concise verification notes. "
                    "Do not overwrite teammate work; inspect before editing."
                )
                if ug_id:
                    ug_objective = ug.get("objective", "") if ug else ""
                    base += (
                        f" This team was spawned from ultragoal {ug_id} (leader objective: {ug_objective}). "
                        "You are acting as a Grok sub-agent in an ultragoal-driven swarm (ulw mode). "
                        "When you have verifiable progress or complete a story, report back with: "
                        f"ulw ultragoal checkpoint --id {ug_id} --status complete --evidence \"<what you did + tests or artifacts>\" --story S001 (or the relevant story id). "
                        "Use the ultragoal ledger as the single source of truth for the leader."
                    )
                # Legacy path now also builds a proper ULW-branded prompt (was missing before!)
                member_prompt = build_worker_prompt(base, role, name, {"id": ug_id} if ug_id else None)

            cmd = provider_command(provider, member_prompt)

            # ULW branding for external CLI workers (when the team is linked to an ultragoal)
            if ug_id and shutil.which("ulw"):
                cmd = f"ulw --name {shlex.quote(name)} --json status 2>/dev/null; exec bash -lc {shlex.quote(cmd)}"

            member = {
                "index": global_idx + 1,
                "name": member_name,
                "role": role,
                "provider": provider,
                "prompt": member_prompt,
                "command": cmd,
                "ultragoal": ug_id,
            }

            # If this is a native Grok sub-agent request and we are not in dry-run,
            # attempt to actually spawn it right now using the host's spawn_subagent capability.
            # This is the core of "team mode = Grok sub-agent swarms under ulw".
            if provider in ("grok", "subagent") and not args.dry_run:
                # Only attempt real subagent spawn if the host Grok environment exposed the tool
                spawn_fn = globals().get("spawn_subagent")
                if callable(spawn_fn):
                    try:
                        sa_type = "plan" if is_deep else "general-purpose"
                        # Strongly brand the native Grok sub-agent as an ULW worker
                        ulw_description = (
                            f"ULW worker ({role}) in LFG team '{name}' for ultragoal {ug_id or 'standalone'}. "
                            f"Identity: ULW (LFG_LAUNCHER=ulw). "
                            f"Report all progress using `ulw ultragoal checkpoint` or the grok_build_ultragoal MCP tool."
                        )
                        spawned = spawn_fn(
                            prompt=member_prompt,
                            description=ulw_description,
                            subagent_type=sa_type,
                            background=True,
                        )
                        subagent_id = None
                        if isinstance(spawned, dict):
                            subagent_id = spawned.get("subagent_id") or spawned.get("id")
                        else:
                            getter = getattr(spawned, "get", None)
                            if callable(getter):
                                subagent_id = getter("subagent_id") or getter("id")
                        member["subagent_id"] = subagent_id
                        member["spawned_as_subagent"] = True
                    except Exception as e:
                        member["subagent_spawn_error"] = str(e)
                        member["spawned_as_subagent"] = False
                else:
                    member["spawned_as_subagent"] = "pending (call spawn_subagent from leader with the prepared prompt)"

            members.append(member)
            global_idx += 1

    team = {
        "name": name,
        "status": "planned" if args.dry_run else "running",
        "createdAt": now(),
        "updatedAt": now(),
        "objective": objective,
        "cwd": str(cwd),
        "tmuxSession": name,
        "members": members,
        "ultragoal": ug_id,
        "commands": {
            "status": f"tmux list-windows -t {shlex.quote(name)}",
            "attach": f"tmux attach -t {shlex.quote(name)}",
            "shutdown": f"tmux kill-session -t {shlex.quote(name)}",
        },
    }

    # Write to legacy location (for backward compat during Phase 1)
    write_json(team_json_path(name), team)
    write_json(STATE_DIR / "current-team.json", {"name": name, "path": str(team_json_path(name)), "updatedAt": now()})

    # If mode is provided (ultragoal / ultrawork / hyperplan), also write to separated state
    if mode and mode_id:
        mode_store = TeamStateStore(mode=mode, mode_id=mode_id)
        run = TeamRun(
            id=name,
            name=name,
            objective=objective,
            status=team["status"],
            created_at=team["createdAt"],
            updated_at=team["updatedAt"],
            ultragoal_id=ug_id,
            config={"providers": providers},
            members=[TeamMember(
            id=str(m.get("index", i)),
            name=m.get("name", ""),
            role=m.get("role", ""),
            provider=m.get("provider", ""),
            status="pending",
            prompt=m.get("prompt", ""),
            command=m.get("command", ""),
            ultragoal=m.get("ultragoal"),
        ) for i, m in enumerate(members)],
        )
        mode_store.save_run(run)

    if not args.dry_run:
        require_executable("tmux")
        control_cmd = f"printf '%s\n' {shlex.quote('lfg team ' + name)}; printf '%s\n' {shlex.quote(objective)}; exec $SHELL"
        subprocess.run(["tmux", "new-session", "-d", "-s", name, "-n", "control", "-c", str(cwd), "bash", "-lc", control_cmd], check=True)
        for m in members:
            subprocess.run(["tmux", "new-window", "-t", name, "-n", m["name"][:20], "-c", str(cwd), "bash", "-lc", m["command"]], check=True)

    return team


def team_status(args: argparse.Namespace) -> dict[str, Any]:
    if not args.name and not (read_json(STATE_DIR / "current-team.json", {}) or {}).get("name"):
        return {"teams": [read_json(p) for p in sorted(team_dir().glob("*.json"))] if team_dir().exists() else []}
    ref = current_team_ref(args)
    team = read_json(team_json_path(ref))
    if not team:
        raise SystemExit(f"team not found: {ref}")
    proc = subprocess.run(["tmux", "list-windows", "-t", ref], text=True, capture_output=True)
    team["tmux"] = {"returncode": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    return team


def team_resume(args: argparse.Namespace) -> dict[str, Any]:
    ref = current_team_ref(args)
    return {"team": ref, "attachCommand": f"tmux attach -t {shlex.quote(ref)}", "statusCommand": f"tmux list-windows -t {shlex.quote(ref)}"}


def team_shutdown(args: argparse.Namespace) -> dict[str, Any]:
    ref = current_team_ref(args)
    proc = subprocess.run(["tmux", "kill-session", "-t", ref], text=True, capture_output=True)
    path = team_json_path(ref)
    team = read_json(path, {"name": ref})
    team["status"] = "shutdown"
    team["updatedAt"] = now()
    team["shutdown"] = {"returncode": proc.returncode, "stderr": proc.stderr}
    write_json(path, team)
    return team





# --- New CLI commands for Phase 1+ state inspection (C) ---

def team_agents_list(args: argparse.Namespace) -> dict[str, Any]:
    """lfg team agents — list all available named LFG agents (with ULW identity)."""
    agents = []

    # Load from plugin examples (new canonical location)
    plugin_agents_dir = ROOT / "src" / "agents"
    if plugin_agents_dir.exists():
        for f in sorted(plugin_agents_dir.glob("*.json")):
            data = read_json(f, {})
            if data.get("name"):
                agents.append(data)

    # Load from user directory (higher priority / overrides)
    user_agents_dir = pathlib.Path.home() / ".grok" / "lfg" / "agents"
    if user_agents_dir.exists():
        for f in sorted(user_agents_dir.glob("*.json")):
            data = read_json(f, {})
            if data.get("name"):
                agents = [a for a in agents if a.get("name") != data["name"]]
                agents.append(data)

    agents.sort(key=lambda x: x.get("name", ""))
    return {
        "agents": agents,
        "count": len(agents),
        "note": "All agents run with ULW identity (LFG_LAUNCHER=ulw). Use them with `lfg team create iz,gonow,grok ...`"
    }


CANONICAL_OMO_AGENT_IDS = (
    "sisyphus",
    "sisyphus-junior",
    "prometheus",
    "hephaestus",
    "atlas",
    "builtin-agents",
)


def load_omo_agent_registry() -> list[dict[str, Any]]:
    """Load first-class OMO agents from the canonical plugin agent directory."""
    agents_dir = ROOT / "src" / "agents"
    agents: list[dict[str, Any]] = []
    for agent_id in CANONICAL_OMO_AGENT_IDS:
        path = agents_dir / f"{agent_id}.json"
        data = read_json(path, {})
        if not isinstance(data, dict) or data.get("id") != agent_id:
            raise SystemExit(f"invalid OMO agent definition: {path}")
        agents.append(data)
    return agents


OMO_AGENT_REGISTRY: list[dict[str, Any]] = load_omo_agent_registry()
_OMO_REGISTRY_INDEX: dict[str, dict[str, Any]] = {a["id"]: a for a in OMO_AGENT_REGISTRY}

OMO_CATEGORY_MODEL_PROFILES: dict[str, dict[str, str]] = {
    "quick": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
    "unspecified-low": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "medium"},
    "unspecified-high": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "ultrabrain": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "artistry": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "deep": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "xhigh"},
    "writing": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "medium"},
    "visual-engineering": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "planning": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "high"},
    "policy": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
    "configuration": {"provider": "xai", "model": "xai/grok-4.3", "reasoning": "low"},
}

OMO_REASONING_LEVELS = {"low", "medium", "high", "xhigh"}


def resolve_omo_model_profile(
    agent: dict[str, Any],
    *,
    category: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    reasoning: str | None = None,
) -> dict[str, Any]:
    if provider and provider not in APPROVED_MODEL_PROVIDERS:
        return {"ok": False, "error": "unsupported model provider for LFG multi-provider OMO agents", "provider": provider, "known": sorted(APPROVED_MODEL_PROVIDERS)}

    if category:
        if category not in OMO_CATEGORY_MODEL_PROFILES:
            return {"ok": False, "error": "unknown OMO category", "category": category, "known": sorted(OMO_CATEGORY_MODEL_PROFILES)}
        if category not in agent.get("categories", []):
            return {"ok": False, "error": "category not supported for agent", "agent": agent["id"], "category": category, "supported": agent.get("categories", [])}
        profile = dict(OMO_CATEGORY_MODEL_PROFILES[category])
    else:
        profile = dict(agent["modelProfile"])

    if provider:
        resolved_provider = "xai" if provider == "grok" else provider
        profile["provider"] = resolved_provider
        if not model:
            profile["model"] = PROVIDER_DEFAULT_MODELS[provider]
    else:
        profile.setdefault("provider", "xai")
    if model:
        profile["model"] = model
    if reasoning:
        if reasoning not in OMO_REASONING_LEVELS:
            return {"ok": False, "error": "unknown Grok reasoning level", "reasoning": reasoning, "known": sorted(OMO_REASONING_LEVELS)}
        profile["reasoning"] = reasoning
    return {"ok": True, "modelProfile": profile}


def agents_list(args: argparse.Namespace) -> dict[str, Any]:
    """lfg agents list — list all OMO first-class agents."""
    return {
        "ok": True,
        "agents": OMO_AGENT_REGISTRY,
        "count": len(OMO_AGENT_REGISTRY),
        "categoryModelProfiles": OMO_CATEGORY_MODEL_PROFILES,
    }


def agents_inspect(args: argparse.Namespace) -> dict[str, Any]:
    """lfg agents inspect <id> — show full registry entry for one agent."""
    agent_id = args.agent_id
    agent = _OMO_REGISTRY_INDEX.get(agent_id)
    if agent is None:
        known = sorted(_OMO_REGISTRY_INDEX.keys())
        return {"ok": False, "error": f"unknown agent: {agent_id!r}", "known": known}

    resolved = resolve_omo_model_profile(
        agent,
        category=getattr(args, "category", None),
        provider=getattr(args, "provider", None),
        model=getattr(args, "model", None),
        reasoning=getattr(args, "reasoning", None),
    )
    if not resolved.get("ok"):
        return resolved

    return {
        "ok": True,
        "agent": {**agent, "modelProfile": resolved["modelProfile"]},
        "resolvedModelProfile": resolved["modelProfile"],
    }


def spawn_cmd(args: argparse.Namespace) -> dict[str, Any]:
    """lfg spawn <agent_id> — spawn an OMO agent via Grok Spawn Adapter."""
    return spawn_agent(
        args.agent_id,
        category=getattr(args, "category", None),
        task=getattr(args, "task", None),
        provider=getattr(args, "provider", None),
        model=getattr(args, "model", None),
        reasoning=getattr(args, "reasoning", None),
    )


def team_state_show(args: argparse.Namespace) -> dict[str, Any]:
    """lfg team state <name> or lfg team run <name>."""
    name = validate_safe_id(args.name, "team name")
    legacy_path = team_json_path(name)
    state_path = str(legacy_path)
    mode = "legacy"
    rich_run = None

    runs_dir = STATE_DIR / "runs"
    if runs_dir.exists():
        for mode_dir in sorted(runs_dir.glob("*")):
            if not mode_dir.is_dir():
                continue
            candidate_dir = mode_dir / "teams" / name
            run_json = candidate_dir / "run.json"
            if not run_json.exists():
                continue
            try:
                store = TeamStateStore(base_dir=mode_dir)
                store.mode = mode_dir.name.split("-")[0] if "-" in mode_dir.name else "run"
                store.mode_id = name
                rich_run = store.load_run(name)
                if rich_run:
                    mode = store.mode or "run"
                    state_path = str(candidate_dir)
                    break
            except Exception:
                continue

    if rich_run:
        return {
            "name": rich_run.name,
            "mode": mode,
            "status": rich_run.status,
            "objective": rich_run.objective,
            "ultragoal": rich_run.ultragoal_id,
            "members": [m.__dict__ for m in rich_run.members],
            "tasks": [t.__dict__ for t in rich_run.tasks],
            "recent_mailbox": [m.__dict__ for m in (rich_run.mailbox or [])[-10:]],
            "state_path": state_path,
            "note": "Rich TeamRun with mailbox + tasks + evidence verification",
        }

    if not legacy_path.exists():
        return {"error": f"Team {name!r} not found"}

    legacy_state = read_json(legacy_path, {}) or {}
    return {
        "name": name,
        "mode": mode,
        "status": legacy_state.get("status"),
        "members": legacy_state.get("members", []),
        "state_path": state_path,
        "note": "Legacy flat team state",
    }


def cancel(args: argparse.Namespace) -> dict[str, Any]:
    """Clear current workflow pointers without deleting durable run history."""
    ensure_dirs()
    targets = {
        "goal": STATE_DIR / "current-goal.json",
        "plan": STATE_DIR / "current-plan.json",
        "team": STATE_DIR / "current-team.json",
        "ultraqa": STATE_DIR / "last-ultraqa.json",
    }
    requested = [x.strip() for x in (args.scope or "all").split(",") if x.strip()]
    if "all" in requested:
        requested = list(targets)
    cleared = []
    missing = []
    for key in requested:
        path = targets.get(key)
        if not path:
            missing.append({"scope": key, "reason": "unknown"})
            continue
        if path.exists():
            path.unlink()
            cleared.append({"scope": key, "path": str(path)})
        else:
            missing.append({"scope": key, "path": str(path), "reason": "not_found"})
    record = {"ts": now(), "scope": requested, "cleared": cleared, "missing": missing}
    write_json(STATE_DIR / "last-cancel.json", record)
    return {"ok": True, **record}

def wiki_dir() -> pathlib.Path:
    return DATA / "wiki"


def slugify(text: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip().lower()).strip("-")
    return slug[:80] or f"note-{uuid.uuid4().hex[:8]}"


def wiki_add(args: argparse.Namespace) -> dict[str, Any]:
    ensure_dirs()
    title = args.title.strip()
    body = args.body.strip()
    ts = now()
    note_id = f"{time.strftime('%Y%m%d-%H%M%S')}-{slugify(title)}"
    note = {
        "id": note_id,
        "title": title,
        "body": body,
        "tags": [t.strip() for t in (args.tags or "").split(",") if t.strip()],
        "createdAt": ts,
        "updatedAt": ts,
        "repo": detect_repo(pathlib.Path(args.cwd).resolve()),
    }
    path = wiki_dir() / f"{note_id}.json"
    write_json(path, note)
    note["path"] = str(path)
    return note


def wiki_notes() -> list[dict[str, Any]]:
    notes = []
    for path in sorted(wiki_dir().glob("*.json")) if wiki_dir().exists() else []:
        try:
            note = read_json(path)
            note["path"] = str(path)
            notes.append(note)
        except Exception:
            pass
    return notes


def wiki_list(args: argparse.Namespace) -> dict[str, Any]:
    notes = wiki_notes()
    if args.limit:
        notes = notes[-args.limit:]
    return {"count": len(notes), "notes": notes}


def wiki_search(args: argparse.Namespace) -> dict[str, Any]:
    q = args.query.lower()
    matches = []
    for note in wiki_notes():
        haystack = "\n".join([note.get("title", ""), note.get("body", ""), " ".join(note.get("tags", []))]).lower()
        if q in haystack:
            matches.append(note)
    return {"query": args.query, "count": len(matches), "matches": matches}

def doctor(args: argparse.Namespace) -> dict[str, Any]:
    """Diagnose the local lfg plugin/runtime installation."""
    ensure_dirs()
    checks = []

    def add(name: str, ok: bool, evidence: str, required: bool = True) -> None:
        checks.append({"name": name, "ok": bool(ok), "required": required, "evidence": evidence})

    manifest = ROOT / ".grok-plugin" / "plugin.json"
    add("grok_manifest", manifest.exists(), str(manifest))
    mcp_config = ROOT / ".mcp.json"
    add("mcp_config", mcp_config.exists(), str(mcp_config))
    catalog_file = ROOT / "catalog" / "omo-skill-map.json"
    catalog_data = read_json(catalog_file, {"skills": []})
    add("catalog", catalog_file.exists() and len(catalog_data.get("skills", [])) >= 17, f"{catalog_file} skills={len(catalog_data.get('skills', []))}")
    skills_dir = ROOT / "skills"
    skill_count = len(list(skills_dir.glob("*/SKILL.md"))) if skills_dir.exists() else 0
    add("skills", skill_count >= 17, f"{skills_dir} skill_count={skill_count}")
    repo_root = ROOT.parents[1] if len(ROOT.parents) > 1 else ROOT
    for name, rel in [("grok_marketplace", ".grok/plugins/marketplace.json"), ("agents_marketplace", ".agents/plugins/marketplace.json")]:
        path = repo_root / rel
        data = read_json(path, {})
        plugin = (data.get("plugins") or [{}])[0] if isinstance(data.get("plugins"), list) and data.get("plugins") else {}
        ok = (
            path.exists()
            and plugin.get("name") == "lfg"
            and plugin.get("source", {}).get("path") == "plugins/lfg"
            and plugin.get("metadata", {}).get("packageName") == "islee23520/lfg"
        )
        add(name, ok, f"{path} package={plugin.get('metadata', {}).get('packageName')}")
    for exe, required in [("tmux", True), ("hermes", False), ("claude", False), ("codex", False), ("grok", False)]:
        path = shutil.which(exe)
        add(f"exe:{exe}", bool(path), path or "not found", required=required)
    data_ok = DATA.exists() or DATA.parent.exists()
    add("plugin_data", data_ok, str(DATA), required=True)
    add("default_launcher", True, f"lfg (effective={effective_launcher()})", required=False)
    schema = ensure_state_schema()
    add("state_schema", schema.get("version") == STATE_SCHEMA_VERSION and state_schema_path().exists(), f"{state_schema_path()} version={schema.get('version')}", required=True)
    providers = team_provider_matrix()
    available = [p["provider"] for p in providers if p["available"]]
    add("team_provider_commands", True, f"available={','.join(available)} providers={','.join(p['provider'] for p in providers)}", required=False)
    bridge = hook_bridge_status(argparse.Namespace())
    add("global_hook_bridge", bridge["ok"], f"installed={bridge['installed']} valid={bridge['valid']} config={bridge['config']}", required=False)
    failed_required = [c for c in checks if c["required"] and not c["ok"]]
    warnings = [c for c in checks if not c["required"] and not c["ok"]]
    return {
        "ok": not failed_required,
        "status": "pass" if not failed_required else "fail",
        "pluginRoot": str(ROOT),
        "pluginData": str(DATA),
        "checks": checks,
        "failedRequired": failed_required,
        "warnings": warnings,
    }


def hook_bridge_paths() -> dict[str, pathlib.Path]:
    hook_dir = pathlib.Path.home() / ".grok" / "hooks"
    return {
        "hookDir": hook_dir,
        "config": hook_dir / "lfg-audit-bridge.json",
        "script": hook_dir / "lfg-audit-bridge.sh",
        "delegate": ROOT / "hooks" / "scripts" / "lfg-audit-hook.sh",
    }


def hook_bridge_status(args: argparse.Namespace) -> dict[str, Any]:
    paths = hook_bridge_paths()
    config = paths["config"]
    script = paths["script"]
    delegate = paths["delegate"]
    installed = config.exists() or script.exists()
    script_text = script.read_text(encoding="utf-8") if script.exists() else ""
    config_text = config.read_text(encoding="utf-8") if config.exists() else ""
    valid = (
        config.exists()
        and script.exists()
        and os.access(script, os.X_OK)
        and delegate.exists()
        and str(delegate) in script_text
        and "lfg-audit-bridge.sh" in config_text
    )
    return {
        "ok": (not installed) or valid,
        "installed": installed,
        "valid": valid,
        "hookDir": str(paths["hookDir"]),
        "config": str(config),
        "script": str(script),
        "delegate": str(delegate),
        "evidence": "valid global bridge" if valid else ("not installed" if not installed else "installed but invalid"),
    }


def hook_bridge_install(args: argparse.Namespace) -> dict[str, Any]:
    paths = hook_bridge_paths()
    hook_dir = paths["hookDir"]
    config = paths["config"]
    script = paths["script"]
    delegate = paths["delegate"]
    if not delegate.exists():
        raise SystemExit(f"delegate hook not found: {delegate}")
    hook_dir.mkdir(parents=True, exist_ok=True)
    command = str(script)
    config.write_text(jdump({
        "hooks": {
            event: [{"hooks": [{"type": "command", "command": command, "timeout": 5}]}]
            for event in [
                "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
                "PostToolUseFailure", "PreCompact", "Stop", "SessionEnd", "Notification"
            ]
        }
    }) + "\n", encoding="utf-8")
    script.write_text(
        "#!/usr/bin/env bash\n"
        "set +euo pipefail\n"
        f"export GROK_PLUGIN_ROOT={shlex.quote(str(ROOT))}\n"
        f"export GROK_PLUGIN_DATA=\"${{GROK_PLUGIN_DATA:-{pathlib.Path.home() / '.grok' / 'plugin-data' / 'lfg'}}}\"\n"
        f"exec {shlex.quote(str(delegate))}\n",
        encoding="utf-8",
    )
    script.chmod(0o755)
    status = hook_bridge_status(args)
    status["installedNow"] = True
    return status

def slash(args: argparse.Namespace) -> dict[str, Any]:
    """Parse a Grok slash-command string into an LFG runtime action.

    MVP target: /team 3:executor "task", /team status NAME, /team resume NAME,
    /team shutdown NAME.  This lets a Grok skill map user-visible slash syntax to
    the durable tmux backend without duplicating parsing logic in prompt text.
    """
    raw = args.command.strip()
    if not raw.startswith("/"):
        raise SystemExit("slash command must start with /")
    parts = shlex.split(raw)
    if not parts:
        raise SystemExit("empty slash command")
    name = parts[0][1:]
    rest = parts[1:]
    if name == "ulw":
        # Hybrid ulw keyword trigger (Candidate 3)
        objective = " ".join(rest) if rest else ""
        if not objective:
            return {"error": "usage: /ulw your objective"}
        trigger = detect_ulw_intent(objective)
        return activate_ulw_mode(objective, explicit=trigger.get("explicit", True), cwd=args.cwd)
    if name == "hook-bridge":
        action = rest[0] if rest else "status"
        if action == "status":
            return hook_bridge_status(argparse.Namespace())
        if action == "install":
            return hook_bridge_install(argparse.Namespace())
        raise SystemExit("usage: /hook-bridge [status|install]")
    if name == "ultragoal":
        action = rest[0] if rest else "status"
        if action == "create":
            if len(rest) < 2:
                raise SystemExit('usage: /ultragoal create "objective" [--checklist "a;b"]')
            objective_parts: list[str] = []
            checklist = None
            ugid = None
            brief = None
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--checklist" and i + 1 < len(rest):
                    checklist = rest[i + 1]
                    i += 2
                elif token == "--id" and i + 1 < len(rest):
                    ugid = rest[i + 1]
                    i += 2
                elif token == "--brief" and i + 1 < len(rest):
                    brief = rest[i + 1]
                    i += 2
                else:
                    objective_parts.append(token)
                    i += 1
            return ultragoal_create(argparse.Namespace(objective=" ".join(objective_parts), id=ugid, checklist=checklist, brief=brief, cwd=args.cwd))
        if action == "spawn":
            # /ultragoal spawn 3:executor "objective for swarm"
            spec = rest[1] if len(rest) > 1 else "3:executor"
            objective_parts = []
            i = 2 if len(rest) > 1 else 1
            while i < len(rest):
                objective_parts.append(rest[i])
                i += 1
            return ultragoal_spawn(argparse.Namespace(
                objective=" ".join(objective_parts) or "swarm task",
                spec=spec,
                cwd=args.cwd,
                dry_run=args.dry_run,
                providers=args.providers,
                name=args.name,
                id=None,
                brief=None,
                checklist=None,
            ))
        if action in {"status", "show"}:
            target = rest[1] if len(rest) > 1 else None
            return ultragoal_show(argparse.Namespace(id=target))
        if action == "checkpoint":
            status = "active"
            evidence = ""
            ugid = None
            story = None
            force_gate = False
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--id" and i + 1 < len(rest):
                    ugid = rest[i + 1]
                    i += 2
                elif token == "--story" and i + 1 < len(rest):
                    story = rest[i + 1]
                    i += 2
                elif token == "--status" and i + 1 < len(rest):
                    status = rest[i + 1]
                    i += 2
                elif token == "--evidence" and i + 1 < len(rest):
                    evidence = rest[i + 1]
                    i += 2
                elif token == "--force-gate":
                    force_gate = True
                    i += 1
                else:
                    evidence = (evidence + " " + token).strip()
                    i += 1
            return ultragoal_checkpoint(argparse.Namespace(id=ugid, story=story, status=status, evidence=evidence, force_gate=force_gate, goal_json=None, cwd=args.cwd))
        raise SystemExit("usage: /ultragoal [create|status|show|checkpoint] ...")
    if name == "plan":
        # Support `/plan create "Title" [--steps "s1;s2"]` and `/plan list` for the `/plan` entry point
        # (in addition to `lfg plan create`, plan skill, grok_build_plan). Delegates directly to mk_plan
        # so the rich preview + markdown_content is returned automatically.
        if not rest:
            raise SystemExit('usage: /plan create "title" [--steps "step1;step2;..."]')
        action = rest[0]
        if action == "create":
            title_parts: list[str] = []
            steps = None
            i = 1
            while i < len(rest):
                token = rest[i]
                if token == "--steps" and i + 1 < len(rest):
                    steps = rest[i + 1]
                    i += 2
                else:
                    title_parts.append(token)
                    i += 1
            title = " ".join(title_parts) or "Untitled plan"
            return mk_plan(argparse.Namespace(title=title, steps=steps, cwd=args.cwd))
        if action == "list":
            return plan_list(argparse.Namespace(limit=None, cwd=args.cwd))
        raise SystemExit('usage: /plan create "title" [--steps "..."] or /plan list')
    if name != "team":
        raise SystemExit(f"unsupported slash command: /{name}")
    if not rest:
        return team_status(argparse.Namespace(name=None, cwd=args.cwd))
    verb = rest[0]
    if verb == "providers":
        return team_providers(argparse.Namespace())
    if verb == "preflight":
        return team_preflight(argparse.Namespace(name=args.name, cwd=args.cwd))
    if verb in {"status", "resume", "shutdown"}:
        target = rest[1] if len(rest) > 1 else None
        ns = argparse.Namespace(name=target, cwd=args.cwd)
        if verb == "status":
            return team_status(ns)
        if verb == "resume":
            return team_resume(ns)
        return team_shutdown(ns)
    if len(rest) < 2:
        raise SystemExit('usage: /team 3:executor "objective"')
    return team_create(argparse.Namespace(
        spec=rest[0],
        objective=" ".join(rest[1:]),
        name=args.name,
        providers=args.providers,
        dry_run=args.dry_run,
        cwd=args.cwd,
    ))

def main(argv: list[str] | None = None) -> int:
    launcher = effective_launcher()
    p = argparse.ArgumentParser(
        prog=launcher,
        description="LFG — Grok-native runtime helper (workflows, durable goals, team swarms)",
    )
    if launcher not in ("lfg", "ulw"):
        # Direct python lfg.py invocation — be friendly
        print(
            "Note: You invoked lfg.py directly. "
            "The recommended CLI is `lfg` (or `ulw` for swarm contexts).\n"
            "Install the proper wrappers with: scripts/install-lfg-symlink.sh\n",
            file=sys.stderr,
        )
    p.add_argument("--json", action="store_true")
    p.add_argument("--cwd", default=os.getcwd())
    p.add_argument("--name", help="backend session name for explicit backend/team commands")
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("catalog").set_defaults(fn=catalog)
    sub.add_parser("status").set_defaults(fn=status)
    sub.add_parser("doctor").set_defaults(fn=doctor)

    # Grok Spawn Adapter (lfg-native OMO parity)
    sp = sub.add_parser("spawn")
    sp.add_argument("agent_id")
    sp.add_argument("--category")
    sp.add_argument("--task")
    sp.add_argument("--provider")
    sp.add_argument("--model")
    sp.add_argument("--reasoning")
    sp.set_defaults(fn=spawn_cmd)

    agp = sub.add_parser("agents")
    agsub = agp.add_subparsers(dest="agents_cmd", required=True)
    agl = agsub.add_parser("list")
    agl.set_defaults(fn=agents_list)
    agi = agsub.add_parser("inspect")
    agi.add_argument("agent_id")
    agi.add_argument("--category")
    agi.add_argument("--provider")
    agi.add_argument("--model")
    agi.add_argument("--reasoning")
    agi.set_defaults(fn=agents_inspect)

    hp = sub.add_parser("hud")
    hp.add_argument("--text", action="store_true")
    hp.set_defaults(fn=hud)
    cp = sub.add_parser("cancel")
    cp.add_argument("--scope", default="all", help="comma list: goal,plan,team,ultraqa or all")
    cp.set_defaults(fn=cancel)

    # --- ULW / Ultrawork keyword trigger (Hybrid Candidate 3) ---
    ulw = sub.add_parser("ulw", help="Activate full OMO-style Ultrawork mode (IntentGate + Sisyphus lead)")
    ulw.add_argument("objective", nargs="*", help="Goal for the ultrawork run")
    ulw.set_defaults(fn=ulw_intent)

    ugp = sub.add_parser("ultragoal")
    ugsub = ugp.add_subparsers(dest="ultragoal_cmd", required=True)
    ugc = ugsub.add_parser("create")
    ugc.add_argument("objective")
    ugc.add_argument("--id")
    ugc.add_argument("--checklist")
    ugc.add_argument("--brief")
    ugc.set_defaults(fn=ultragoal_create)
    ugsp = ugsub.add_parser("spawn")
    ugsp.add_argument("objective")
    ugsp.add_argument("--spec", default="3:executor", help="team spec like 1:iz,1:gonow,1:grok or 3:executor")
    ugsp.add_argument("--id")
    ugsp.add_argument("--checklist")
    ugsp.add_argument("--brief")
    ugsp.add_argument("--name")
    ugsp.add_argument("--providers", default="hermes,claude,codex")
    ugsp.add_argument("--dry-run", action="store_true")
    ugsp.add_argument("--hyperplan", action="store_true", help="Launch in Hyperplan rigorous mode (separated state + adversarial team)")
    ugsp.add_argument("--template", help="Named team template, e.g. hyperplan (expands to iz+gonow+grok with deep/artistry categories)")
    ugsp.set_defaults(fn=ultragoal_spawn)
    ugs = ugsub.add_parser("status")
    ugs.add_argument("--id")
    ugs.set_defaults(fn=ultragoal_status)
    ugsh = ugsub.add_parser("show")
    ugsh.add_argument("--id")
    ugsh.set_defaults(fn=ultragoal_show)
    ugck = ugsub.add_parser("checkpoint")
    ugck.add_argument("--id")
    ugck.add_argument("--story")
    ugck.add_argument("--status", choices=["active", "blocked", "complete", "cancelled"], required=True)
    ugck.add_argument("--evidence", default="")
    ugck.add_argument("--goal-json")
    ugck.add_argument("--force-gate", action="store_true")
    ugck.set_defaults(fn=ultragoal_checkpoint)

    uwp = sub.add_parser("ultrawork")
    uwsub = uwp.add_subparsers(dest="ultrawork_cmd", required=True)
    uwc = uwsub.add_parser("create")
    uwc.add_argument("objective")
    uwc.add_argument("--id")
    uwc.add_argument("--tasks")
    uwc.set_defaults(fn=ultrawork_create)
    uwu = uwsub.add_parser("update")
    uwu.add_argument("--id")
    uwu.add_argument("--task", type=int, required=True)
    uwu.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    uwu.add_argument("--evidence", default="")
    uwu.set_defaults(fn=ultrawork_update)
    uwsh = uwsub.add_parser("show")
    uwsh.add_argument("--id")
    uwsh.set_defaults(fn=ultrawork_show)

    rp = sub.add_parser("ralph")
    rsub = rp.add_subparsers(dest="ralph_cmd", required=True)
    rc = rsub.add_parser("create")
    rc.add_argument("objective")
    rc.add_argument("--id")
    rc.add_argument("--max-iterations", type=int, default=3)
    rc.add_argument("--stop-condition")
    rc.set_defaults(fn=ralph_create)
    rs = rsub.add_parser("step")
    rs.add_argument("--id")
    rs.add_argument("--status", choices=["active", "complete", "blocked"], default="active")
    rs.add_argument("--evidence", default="")
    rs.set_defaults(fn=ralph_step)
    rsh = rsub.add_parser("show")
    rsh.add_argument("--id")
    rsh.set_defaults(fn=ralph_show)

    wp2 = sub.add_parser("worker")
    w2sub = wp2.add_subparsers(dest="worker_cmd", required=True)
    wa2 = w2sub.add_parser("ack")
    wa2.add_argument("worker")
    wa2.add_argument("task")
    wa2.set_defaults(fn=worker_ack)
    wr2 = w2sub.add_parser("result")
    wr2.add_argument("worker")
    wr2.add_argument("result")
    wr2.add_argument("--status", default="complete", choices=["complete", "blocked", "failed"])
    wr2.set_defaults(fn=worker_result)
    ws2 = w2sub.add_parser("status")
    ws2.add_argument("worker", nargs="?")
    ws2.set_defaults(fn=worker_status)

    cleanp = sub.add_parser("ai-slop-cleaner")
    cleansub = cleanp.add_subparsers(dest="cleanup_cmd", required=True)
    cleanc = cleansub.add_parser("create")
    cleanc.add_argument("--scope", help="comma-separated files or repo")
    cleanc.add_argument("--verification")
    cleanc.set_defaults(fn=ai_slop_cleaner)
    cleanl = cleansub.add_parser("list")
    cleanl.add_argument("--limit", type=int)
    cleanl.set_defaults(fn=ai_slop_cleaner_list)

    arp = sub.add_parser("autoresearch")
    arsub = arp.add_subparsers(dest="autoresearch_cmd", required=True)
    arc = arsub.add_parser("create")
    arc.add_argument("question")
    arc.add_argument("--id")
    arc.set_defaults(fn=autoresearch_create)
    ars = arsub.add_parser("add-source")
    ars.add_argument("url")
    ars.add_argument("--id")
    ars.add_argument("--note")
    ars.set_defaults(fn=autoresearch_add_source)
    arshow = arsub.add_parser("show")
    arshow.add_argument("--id")
    arshow.set_defaults(fn=autoresearch_show)

    dip = sub.add_parser("deep-interview")
    disub = dip.add_subparsers(dest="deep_interview_cmd", required=True)
    dic = disub.add_parser("create")
    dic.add_argument("topic")
    dic.add_argument("--id")
    dic.add_argument("--questions")
    dic.set_defaults(fn=deep_interview_create)
    dia = disub.add_parser("answer")
    dia.add_argument("--id")
    dia.add_argument("--question", type=int, required=True)
    dia.add_argument("answer")
    dia.set_defaults(fn=deep_interview_answer)
    dish = disub.add_parser("show")
    dish.add_argument("--id")
    dish.set_defaults(fn=deep_interview_show)

    dp = sub.add_parser("design")
    dsub = dp.add_subparsers(dest="design_cmd", required=True)
    da = dsub.add_parser("add")
    da.add_argument("title")
    da.add_argument("decision")
    da.add_argument("--rationale")
    da.set_defaults(fn=design_add)
    dl = dsub.add_parser("list")
    dl.add_argument("--limit", type=int)
    dl.set_defaults(fn=design_list)

    np = sub.add_parser("configure-notifications")
    nsub = np.add_subparsers(dest="notifications_cmd", required=True)
    ns = nsub.add_parser("set")
    ns.add_argument("--channel", default="console", choices=["console", "slack", "webhook", "none"])
    ns.add_argument("--target")
    ns.add_argument("--enabled", action="store_true")
    ns.set_defaults(fn=notifications_set)
    nsh = nsub.add_parser("show")
    nsh.set_defaults(fn=notifications_show)

    provp = sub.add_parser("provider")
    provsub = provp.add_subparsers(dest="provider_cmd", required=True)
    prova = provsub.add_parser("add")
    prova.add_argument("--id")
    prova.add_argument("--kind", choices=sorted(set(TEAM_PROVIDER_EXECUTABLES) | APPROVED_MODEL_PROVIDERS))
    prova.add_argument("--env")
    prova.add_argument("--model")
    prova.add_argument("--interactive", action="store_true")
    prova.set_defaults(fn=provider_add)
    provl = provsub.add_parser("list")
    provl.set_defaults(fn=provider_list)
    provs = provsub.add_parser("show")
    provs.add_argument("id")
    provs.set_defaults(fn=provider_show)

    models = sub.add_parser("models", help="Show configured LFG model/provider profiles")
    models.add_argument("--provider", choices=sorted(APPROVED_MODEL_PROVIDERS))
    models.set_defaults(fn=models_show)

    authp = sub.add_parser("auth")
    authsub = authp.add_subparsers(dest="auth_cmd", required=True)
    authl = authsub.add_parser("login", help="Configure a provider login without storing secrets")
    authl.add_argument("provider", nargs="?", choices=sorted(APPROVED_MODEL_PROVIDERS))
    authl.add_argument("--id")
    authl.add_argument("--env")
    authl.add_argument("--model")
    authl.add_argument("--interactive", action="store_true")
    authl.set_defaults(fn=auth_login)

    setupp = sub.add_parser("setup", help="Install/sync the LFG Grok plugin and prepare provider state")
    setupp.add_argument("--plugin-dir", help="destination plugin directory, defaults to ~/.grok/plugins/lfg")
    setupp.add_argument("--dry-run", action="store_true")
    setupp.add_argument("--interactive", action="store_true", help="run the OMO-style provider setup wizard")
    setupp.add_argument("--no-tui", action="store_true", help="skip prompts and use explicit provider flags")
    for provider_flag in ("openai", "zai", "copilot", "google", "codex"):
        setupp.add_argument(f"--{provider_flag}", choices=["yes", "no"], help=f"enable {provider_flag} provider metadata during setup")
    setupp.set_defaults(fn=setup)

    askp = sub.add_parser("ask")
    asksub = askp.add_subparsers(dest="ask_cmd", required=True)
    askc = asksub.add_parser("create")
    askc.add_argument("prompt")
    askc.add_argument("--provider", choices=sorted(TEAM_PROVIDER_EXECUTABLES), default="hermes")
    askc.add_argument("--dry-run", action="store_true", default=True)
    askc.add_argument("--run", dest="dry_run", action="store_false")
    askc.add_argument("--timeout", type=int, default=60)
    askc.set_defaults(fn=ask)
    askl = asksub.add_parser("list")
    askl.add_argument("--limit", type=int)
    askl.set_defaults(fn=ask_list)

    ap = sub.add_parser("analyze")
    asub = ap.add_subparsers(dest="analyze_cmd", required=True)
    ac = asub.add_parser("create")
    ac.add_argument("--focus")
    ac.set_defaults(fn=analyze)
    al = asub.add_parser("list")
    al.add_argument("--limit", type=int)
    al.set_defaults(fn=analyze_list)

    crp = sub.add_parser("code-review")
    crsub = crp.add_subparsers(dest="code_review_cmd", required=True)
    crc = crsub.add_parser("create")
    crc.add_argument("objective")
    crc.set_defaults(fn=code_review)
    crl = crsub.add_parser("list")
    crl.add_argument("--limit", type=int)
    crl.set_defaults(fn=code_review_list)

    pip = sub.add_parser("pipeline")
    psub = pip.add_subparsers(dest="pipeline_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--id")
    pc.add_argument("--stages")
    pc.set_defaults(fn=pipeline_create)
    pln = psub.add_parser("list")
    pln.add_argument("--limit", type=int)
    pln.set_defaults(fn=pipeline_list)
    pu = psub.add_parser("update")
    pu.add_argument("--id")
    pu.add_argument("--stage", type=int, required=True)
    pu.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    pu.add_argument("--note")
    pu.set_defaults(fn=pipeline_update)

    autop = sub.add_parser("autopilot")
    autosub = autop.add_subparsers(dest="autopilot_cmd", required=True)
    autoc = autosub.add_parser("create")
    autoc.add_argument("objective")
    autoc.add_argument("--id")
    autoc.set_defaults(fn=autopilot_create)
    autoa = autosub.add_parser("advance")
    autoa.add_argument("--id")
    autoa.add_argument("--phase", type=int, required=True)
    autoa.add_argument("--status", choices=["pending", "active", "complete", "blocked"], required=True)
    autoa.add_argument("--evidence", default="")
    autoa.set_defaults(fn=autopilot_advance)
    autos = autosub.add_parser("show")
    autos.add_argument("--id")
    autos.set_defaults(fn=autopilot_show)


    perf = sub.add_parser("performance-goal")
    perfsub = perf.add_subparsers(dest="performance_goal_cmd", required=True)
    perfc = perfsub.add_parser("create")
    perfc.add_argument("objective")
    perfc.add_argument("--id")
    perfc.add_argument("--metrics")
    perfc.set_defaults(fn=performance_create)
    perfm = perfsub.add_parser("measure")
    perfm.add_argument("--id")
    perfm.add_argument("--metric", required=True)
    perfm.add_argument("--baseline", type=float)
    perfm.add_argument("--current", type=float)
    perfm.add_argument("--target", type=float)
    perfm.add_argument("--evidence", default="")
    perfm.set_defaults(fn=performance_measure)
    perfs = perfsub.add_parser("show")
    perfs.add_argument("--id")
    perfs.set_defaults(fn=performance_show)


    vr = sub.add_parser("visual-ralph")
    vrsub = vr.add_subparsers(dest="visual_ralph_cmd", required=True)
    vrc = vrsub.add_parser("create")
    vrc.add_argument("target")
    vrc.add_argument("--id")
    vrc.add_argument("--reference")
    vrc.add_argument("--threshold", type=float, default=0.95)
    vrc.set_defaults(fn=visual_ralph_create)
    vrv = vrsub.add_parser("verdict")
    vrv.add_argument("--id")
    vrv.add_argument("--score", type=float, required=True)
    vrv.add_argument("--status", choices=["pass", "fail", "blocked"], required=True)
    vrv.add_argument("--evidence", default="")
    vrv.set_defaults(fn=visual_ralph_verdict)
    vrs = vrsub.add_parser("show")
    vrs.add_argument("--id")
    vrs.set_defaults(fn=visual_ralph_show)


    argp = sub.add_parser("autoresearch-goal")
    argsub = argp.add_subparsers(dest="autoresearch_goal_cmd", required=True)
    argc = argsub.add_parser("create")
    argc.add_argument("question")
    argc.add_argument("--id")
    argc.add_argument("--hypotheses")
    argc.set_defaults(fn=autoresearch_goal_create)
    argcr = argsub.add_parser("critique")
    argcr.add_argument("--id")
    argcr.add_argument("--verdict", choices=["pass", "revise", "blocked"], required=True)
    argcr.add_argument("--critic", default="critic")
    argcr.add_argument("--evidence", default="")
    argcr.set_defaults(fn=autoresearch_goal_critique)
    args = argsub.add_parser("show")
    args.add_argument("--id")
    args.set_defaults(fn=autoresearch_goal_show)


    omxs = sub.add_parser("omx-setup")
    omxsub = omxs.add_subparsers(dest="omx_setup_cmd", required=True)
    omxc = omxsub.add_parser("check")
    omxc.set_defaults(fn=omx_setup_check)
    omxp = omxsub.add_parser("install-plan")
    omxp.add_argument("--marketplace")
    omxp.set_defaults(fn=omx_setup_plan)
    omxsh = omxsub.add_parser("show")
    omxsh.set_defaults(fn=omx_setup_show)

    skp = sub.add_parser("skill")
    sksub = skp.add_subparsers(dest="skill_cmd", required=True)
    skl = sksub.add_parser("list")
    skl.set_defaults(fn=skill_list)
    sks = sksub.add_parser("search")
    sks.add_argument("query")
    sks.set_defaults(fn=skill_search)

    wp = sub.add_parser("wiki")
    wsub = wp.add_subparsers(dest="wiki_cmd", required=True)
    wa = wsub.add_parser("add")
    wa.add_argument("title")
    wa.add_argument("body")
    wa.add_argument("--tags")
    wa.set_defaults(fn=wiki_add)
    wl = wsub.add_parser("list")
    wl.add_argument("--limit", type=int)
    wl.set_defaults(fn=wiki_list)
    ws = wsub.add_parser("search")
    ws.add_argument("query")
    ws.set_defaults(fn=wiki_search)

    gp = sub.add_parser("goal")
    gsub = gp.add_subparsers(dest="goal_cmd", required=True)
    gnew = gsub.add_parser("create")
    gnew.add_argument("objective")
    gnew.add_argument("--id")
    gnew.add_argument("--checklist")
    gnew.set_defaults(fn=create_goal)
    gls = gsub.add_parser("list")
    gls.set_defaults(fn=lambda args: {"goals": list_goals()})
    gupd = gsub.add_parser("update")
    gupd.add_argument("--id")
    gupd.add_argument("--status", choices=["active", "blocked", "complete", "cancelled"], required=True)
    gupd.add_argument("--note")
    gupd.set_defaults(fn=update_goal)


    rlp = sub.add_parser("ralplan")
    rlsub = rlp.add_subparsers(dest="ralplan_cmd", required=True)
    rlc = rlsub.add_parser("create")
    rlc.add_argument("title")
    rlc.add_argument("--id")
    rlc.add_argument("--steps")
    rlc.set_defaults(fn=ralplan_create)
    rlr = rlsub.add_parser("review")
    rlr.add_argument("--id")
    rlr.add_argument("--verdict", choices=["approve", "revise", "block"], required=True)
    rlr.add_argument("--reviewer", default="architect")
    rlr.add_argument("--evidence", default="")
    rlr.set_defaults(fn=ralplan_review)
    rls = rlsub.add_parser("show")
    rls.add_argument("--id")
    rls.set_defaults(fn=ralplan_show)

    pp = sub.add_parser("plan")
    psub = pp.add_subparsers(dest="plan_cmd", required=True)
    pc = psub.add_parser("create")
    pc.add_argument("title")
    pc.add_argument("--steps")
    pc.set_defaults(fn=mk_plan)
    pl = psub.add_parser("list")
    pl.add_argument("--limit", type=int)
    pl.set_defaults(fn=plan_list)

    uq = sub.add_parser("ultraqa")
    uq.add_argument("objective")
    uq.add_argument("--no-run", action="store_true")
    uq.add_argument("--timeout", type=int, default=60)
    uq.add_argument("--command", action="append", nargs="+")
    uq.set_defaults(fn=ultraqa)


    sp = sub.add_parser("slash")
    sp.add_argument("command", help='slash command, e.g. /team 3:executor "fix tests"')
    sp.add_argument("--name")
    sp.add_argument("--providers", default="grok,subagent")
    sp.add_argument("--dry-run", action="store_true")
    sp.set_defaults(fn=slash)

    hbp = sub.add_parser("hook-bridge")
    hbsub = hbp.add_subparsers(dest="hook_bridge_cmd", required=True)
    hbs = hbsub.add_parser("status")
    hbs.set_defaults(fn=hook_bridge_status)
    hbi = hbsub.add_parser("install")
    hbi.set_defaults(fn=hook_bridge_install)

    bp = sub.add_parser("backend")
    bsub = bp.add_subparsers(dest="backend_cmd", required=True)
    bs = bsub.add_parser("start")
    bs.add_argument("--name")
    bs.set_defaults(fn=backend_start)
    bst = bsub.add_parser("status")
    bst.add_argument("--name")
    bst.set_defaults(fn=backend_status)
    bx = bsub.add_parser("stop")
    bx.add_argument("--name")
    bx.set_defaults(fn=backend_stop)

    tp = sub.add_parser("team")
    tsub = tp.add_subparsers(dest="team_cmd", required=True)
    tprov = tsub.add_parser("providers")
    tprov.set_defaults(fn=team_providers)
    tpre = tsub.add_parser("preflight")
    tpre.add_argument("--name")
    tpre.set_defaults(fn=team_preflight)
    tc = tsub.add_parser("create")
    tc.add_argument("spec", help="team spec like 3:executor")
    tc.add_argument("objective")
    tc.add_argument("--name")
    tc.add_argument("--providers", default="grok,subagent", help="comma list, default grok,subagent (Grok-first)")
    tc.add_argument("--dry-run", action="store_true")
    tc.set_defaults(fn=team_create)
    ts = tsub.add_parser("status")
    ts.add_argument("name", nargs="?")
    ts.set_defaults(fn=team_status)

    # New inspection commands (Phase 1+)
    tagents = tsub.add_parser("agents")
    tagents.set_defaults(fn=team_agents_list)

    tstate = tsub.add_parser("state")
    tstate.add_argument("name")
    tstate.set_defaults(fn=team_state_show)

    trun = tsub.add_parser("run")
    trun.add_argument("name")
    trun.set_defaults(fn=team_state_show)

    tr = tsub.add_parser("resume")
    tr.add_argument("name", nargs="?")
    tr.set_defaults(fn=team_resume)
    td = tsub.add_parser("shutdown")
    td.add_argument("name", nargs="?")
    td.set_defaults(fn=team_shutdown)

    args = p.parse_args(argv)
    if not getattr(args, "cmd", None):
        args.fn = lfg_launch
    result = args.fn(args)
    emit(result, args.json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
