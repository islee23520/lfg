from __future__ import annotations

import json
from typing import Any, Dict


def build_compaction_protection_injection(snapshot: Dict[str, Any], event: str) -> str:
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
