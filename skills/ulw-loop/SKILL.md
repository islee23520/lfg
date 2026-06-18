---
name: ulw-loop
description: Grok-native manual-continuation ULW workflow that keeps durable .omo state, uses hook-injected context, and advances evidence-bound todos until verification passes.
---

# ulw-loop

Use this skill when the user says `ulw`, `/ulw-loop`, or asks for an ultrawork / continuous work session. ULW is a manual-continuation loop: complete one evidence-bound step, refresh state, select the next todo, and continue until the plan is done.

## Bootstrap

1. Confirm the requested outcome and project root.
2. Load the current `.omo` state from hook-injected context first. The `SessionStart` and `UserPromptSubmit` hooks run `lfg-config-loader.mjs`, which summarizes LFG config, the active `.omo` ledger, active plan, and any ULW loop sessions.
3. If hook context is absent or incomplete, inspect the local `.omo` directory directly before acting.
4. Start or resume the active ULW session under `.omo/ulw/`:
   - `plan.json` stores the goal, constraints, selected plan file, and verification gates.
   - `current-step.json` stores the active todo id, status, started timestamp, and last evidence entry.
   - `todos.json` stores ordered todo objects with `id`, `title`, `status`, `dependsOn`, `evidenceRequired`, and `verification` fields.
   - `findings.json` stores durable observations, decisions, blockers, and references discovered during the loop.
   - Optional session files such as `.omo/ulw/<session-id>.json` may mirror the same state for history.
5. If no plan exists, ask for planning or invoke the `ulw-plan` skill before starting implementation.

## Execution Loop

Repeat this loop until every todo is complete:

1. **Read state**: Review hook-injected `.omo` context, then read `.omo/ulw/plan.json`, `.omo/ulw/todos.json`, `.omo/ulw/current-step.json`, and `.omo/ulw/findings.json` when available.
2. **Choose next todo**: Select the first pending todo whose dependencies are complete. If a todo is blocked, record the blocker in `findings.json` and move to the next unblocked item. If every remaining todo is blocked, stop and report the blocker.
3. **Set current step**: Update `.omo/ulw/current-step.json` with the chosen todo, expected result, required proof, and status `in_progress`.
4. **Act narrowly**: Do only the work required for that todo. Preserve unrelated files and existing project conventions.
5. **Capture evidence**: Every step must produce proof before it can be marked complete. Acceptable proof includes:
   - relevant test/typecheck/build output,
   - diagnostics output for changed files,
   - concise file diff or list of changed paths,
   - generated artifact path,
   - manual QA notes with exact command or observation.
6. **Update state**: Append findings and evidence to `.omo/ulw/findings.json`; mark the todo `completed` in `.omo/ulw/todos.json`; update `.omo/ulw/current-step.json` with status `completed`, completed timestamp, and evidence summary.
7. **Manual continuation**: Immediately read the next todo from `.omo/ulw/todos.json` and continue. Do not wait for a new user prompt unless the next item is blocked, the plan requires human approval, or verification fails in a way that needs a user decision.

## Hook-assisted awareness

Grok hooks keep the loop aware across prompts and sessions:

- `SessionStart` loads global LFG config and active `.omo` ledger state through `lfg-config-loader.mjs`.
- `UserPromptSubmit` refreshes that state when the user sends a new instruction, so the agent can resume the correct plan and current step.
- The loader reports whether an active work ledger exists, which plan is active, and whether ULW loop ledgers are present.
- Treat hook context as a snapshot. Before mutating state, confirm the on-disk `.omo/ulw/*.json` files still match the active work you intend to continue.

## Manual-QA channels

Use Manual-QA when automated checks are insufficient or the task changes user-visible behavior:

- Record the QA target, exact command or interaction, observed result, and pass/fail in `.omo/ulw/findings.json`.
- Include screenshots, logs, or output paths when the evidence is visual or interactive.
- If Manual-QA fails, reopen the current todo or create a follow-up todo with the failure evidence attached.

## Stop condition

Stop only when all of the following are true:

1. Every todo in `.omo/ulw/todos.json` is `completed` or explicitly cancelled with a reason approved by the user.
2. Required verification from `.omo/ulw/plan.json` passes.
3. The final state has been written to `.omo/ulw/current-step.json` and `.omo/ulw/findings.json`.
4. The final response summarizes completed work, changed files, and evidence.

If verification fails, continue the loop by adding or reopening the smallest todo that can fix the failure.
