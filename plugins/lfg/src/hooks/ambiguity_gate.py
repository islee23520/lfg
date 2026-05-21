from __future__ import annotations

from typing import Any, Dict


def compute_heuristic_ambiguity(user_prompt: str, snapshot: Dict[str, Any]) -> float:
    if not user_prompt or len(user_prompt.strip()) < 8:
        return 0.85

    prompt_lower = user_prompt.lower()

    direct_signals = ["implement", "fix", "write", "add", "create the", "next task", "evidence", "checkpoint"]
    if any(s in prompt_lower for s in direct_signals) and len(user_prompt) > 25:
        return 0.18

    vague_signals = ["어떻게", "how should", "뭐", "what do you think", "maybe", "perhaps", "아이디어", "생각", "고민"]
    if any(s in prompt_lower for s in vague_signals) and len(user_prompt) < 120:
        return 0.72

    return 0.42
