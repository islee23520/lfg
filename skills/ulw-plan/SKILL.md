---
name: ulw-plan
description: Grok-native planning workflow that writes an evidence-bound plan to .omo/plans before a ULW loop begins.
---

# ulw-plan

Use this skill before `ulw-loop` when the user asks for `ulw`, `/ulw-loop`, or continuous execution but no approved plan exists. The output is a durable markdown plan in `.omo/plans/*.md`; implementation starts only after the plan is clear enough to drive `.omo/ulw/*.json` state.

## Phase 0 — intake and context

1. Restate the user outcome in one sentence.
2. Identify constraints, non-goals, verification gates, and files or systems likely to be touched.
3. Read hook-injected `.omo` context first. `SessionStart` and `UserPromptSubmit` use `lfg-config-loader.mjs` to surface the active plan, work id, ledger status, and ULW loop presence.
4. If existing `.omo/plans/*.md` or `.omo/ulw/*.json` state already matches the request, resume or revise it instead of creating a duplicate plan.
5. For unfamiliar application behavior, perform a Tool Learning Protocol: inspect available commands, scripts, docs, and local conventions before proposing implementation steps.

## Plan file contract

Write the plan to `.omo/plans/<short-slug>.md` with these sections:

- `# <Goal>`
- `## Outcome` — what done means.
- `## Constraints` — user constraints, project constraints, and safety boundaries.
- `## Current context` — relevant files, hook-injected `.omo` state, and existing findings.
- `## Todo graph` — ordered todos with ids, dependencies, expected results, and evidence required.
- `## Verification gates` — checks that must pass before stop.
- `## Risks and rollback` — likely failure points and how to recover.
- `## ULW state seed` — the initial values to write into `.omo/ulw/plan.json`, `.omo/ulw/todos.json`, `.omo/ulw/current-step.json`, and `.omo/ulw/findings.json`.

Each todo must be small enough for one focused ULW iteration and must name the proof required to close it.

## Approval gate

Before starting execution:

1. Present the plan path and concise summary.
2. If the user explicitly asked for autonomous ULW and the plan is low-risk, proceed into `ulw-loop` using the written plan.
3. If the plan changes external systems, destructive data, public API shape, security posture, or broad architecture, ask for approval before implementation.
4. If approval is denied or requirements change, revise the plan file instead of proceeding.

## Phase 3 — seed and hand off to ULW

After the plan is accepted for execution:

1. Create or refresh `.omo/ulw/plan.json` with the plan file path, goal, constraints, and verification gates.
2. Create or refresh `.omo/ulw/todos.json` from the plan's todo graph.
3. Set `.omo/ulw/current-step.json` to the first unblocked todo with status `pending`.
4. Initialize `.omo/ulw/findings.json` with planning assumptions, known risks, and any discovered context.
5. Start `ulw-loop`, which will manually continue through todos until verification passes.

Do not implement during planning unless the user explicitly requests a tiny one-step change that does not need a ULW loop.
