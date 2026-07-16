# lina-build (public Grok Build) → lfg ulw-loop

Source: https://github.com/islee23520/lina-build.git (Rust `grok` / xai-grok-pager)

## Higher-freedom surfaces (use these patterns)

| Grok Build surface | Where | ulw-loop opportunity |
|---|---|---|
| `/goal` + `update_goal` tool | user-guide 04, agent GoalDisplayState | Durable host goal progress across turns; sync with `.omo/ulw-loop` goals |
| Plan mode enter/exit + plan.md | user-guide 19 | Align `create-goals` with decision-complete plan before coding |
| Background tasks + `get_command_or_subagent_output` | user-guide 20 | Non-blocking goal workers; poll RESULT without midflight nudge |
| `monitor` streaming + `/loop` interval | user-guide 20 | Heartbeat-style `complete-goals` / status poll loop |
| Hooks SessionStart/Stop | user-guide 10 | Inject next open goal + criteria on session resume |
| ACP agent mode | user-guide 15 | Optional later: ulw-loop as ACP-visible goal board |

## Non-goals
- Vendor entire lina-build into lfg
- Claim Grok host auto-implements plan-mode intercept (still host-bound)

## Current lfg ulw-loop
- CLI: `lfg ulw-loop create-goals|status|complete-goals|criteria|record-evidence|checkpoint|steer|add-goal|…`
- State: `.omo/ulw-loop/` (+ session-id isolation)
- Codex goal instruction builders already exist (`codex-goal-instruction.ts`)
