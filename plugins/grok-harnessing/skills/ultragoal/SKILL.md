---
name: ultragoal
description: "Grok Build port of OMX `ultragoal`: Create and execute durable repo-native multi-goal plans over Codex goal mode artifacts."
user_invocable: true
metadata:
  package: "linalab-io-framework/grok-build"
  source: "oh-my-codex/plugins/oh-my-codex/skills/ultragoal/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-skill-adapter"
---

# Ultragoal Workflow — Grok Build Port

This skill is the Grok Build adaptation of the OMX `ultragoal` workflow from `oh-my-codex`.

## Port Contract

- Preserve the user-facing OMX intent and command name as closely as Grok plugin skills allow.
- Use Grok-native tools, slash commands, subagents, MCP servers, hooks, and `~/.grok/plugin-data/grok-build/` state instead of Codex-specific internals.
- Keep evidence-first behavior: inspect local artifacts, run bounded commands, record results, and report concrete verification.
- Do not assume Codex-only commands such as `omx ...` exist inside Grok unless the user explicitly wants interop with an installed OMX CLI.
- If the original workflow depends on Codex goal mode, tmux orchestration, or OMX state hooks, translate it into Grok-visible state files and explicit checklist gates.

## Original OMX Summary

- Source skill: `oh-my-codex/plugins/oh-my-codex/skills/ultragoal/SKILL.md`
- Original description: Create and execute durable repo-native multi-goal plans over Codex goal mode artifacts.

## Grok Execution Rules

1. Restate the goal and success criteria.
2. Build a concise scenario/checklist before mutating files.
3. Use repo-local evidence and Grok tools first.
4. Run the smallest meaningful verification command or harness.
5. Store durable workflow notes under `~/.grok/plugin-data/grok-build/ultragoal/` when state is needed.
6. Finish with changed files, commands run, pass/fail evidence, and residual risk.

## Source-Informed Workflow Notes

The complete upstream wording is intentionally not copied verbatim. This adapter tracks the OMX workflow identity and translates it into Grok-native operation. For exact upstream behavior, compare against the source repository and then implement only the pieces that make sense in Grok Build.

## Grok-Native Ultragoal Workflow (OMX Parity)

When the user invokes `/ultragoal` (or "create durable multi-goal plan", "complete goals", "ultragoal status"), follow this flow using the runtime:

1. **Restate + Checklist (this session)**
   - Restate the objective and success criteria.
   - Build a concise scenario/checklist in a durable note under `~/.grok/plugin-data/grok-build/ultragoal/<id>/plan.md` (or append to ledger).
   - Use `lfg goal create` or the higher `lfg ultragoal create` to record the top-level goal.

2. **Create the Ultragoal Plan**
   ```sh
   lfg ultragoal create "Ship full OMX parity for lfg" --id my-ug-1 \
     --brief "Make grok-build/lfg match oh-my-codex ultragoal experience end-to-end." \
     --checklist "design;implement;gate;verify"
   ```
   This produces:
   - `~/.grok/plugin-data/grok-build/ultragoal/my-ug-1/brief.md`
   - `goals.json` (stories + backingGoal link to primitive `goal`)
   - `ledger.jsonl` (immutable checkpoint trail)
   - A backing `goal` record (the "Codex goal" equivalent).

3. **Drive Completion Loop (agent + tools)**
   - Run `lfg ultragoal status --id my-ug-1` to see current stories + recent ledger.
   - For each story: execute work, then checkpoint progress.
   - Use `lfg goal ...` directly for fine-grained backing updates when needed.
   - When a story is ready for checkpoint:
     ```sh
     lfg ultragoal checkpoint --id my-ug-1 --status complete \
       --evidence "tests passed; design doc written" --story S001
     ```

4. **Mandatory Final Quality Gate (for the last/final story)**
   The CLI **enforces** the gate for terminal `complete` on the final story:
   - Run `lfg ai-slop-cleaner create --scope "<changed files>" --verification "post-cleaner test"`
   - Run `lfg code-review create "final ultragoal review" `
   - Only then checkpoint with evidence containing "ai-slop" + "APPROVE" (or pass `--force-gate` for exceptional cases).
   - The gate mirrors the original OMX requirement (verification + cleaner + review with APPROVE/CLEAR).

5. **Ledger & Audit**
   - Every `checkpoint` appends a timestamped entry with status, evidence, optional codex-goal-json snapshot.
   - Use `lfg ultragoal show --id my-ug-1` for full brief + goals + ledger tail.
   - The ledger is the durable source of truth for the multi-goal run.

6. **Team + Ultragoal**
   - Leader (the /ultragoal invoker) owns the ultragoal ledger.
   - Launch `/team` / `lfg team create ...` for parallel workers.
   - Workers report evidence back; leader does the `checkpoint` with fresh `lfg goal` snapshot in the evidence.
   - Never let workers mutate the ultragoal goals/ledger directly.

7. **MCP / Grok Integration**
   - Skills and the MCP server expose `grok_build_ultragoal` (actions: create/status/checkpoint/show).
   - Grok can call the tool; the CLI underneath persists the same state.
   - `/ultragoal` in chat is the user-facing entry that triggers this SKILL.md flow.

8. **Close-out**
   - After final gate + last checkpoint, update the backing goal to complete.
   - Append residual risk + evidence summary to the plan note.
   - Run `lfg doctor` and targeted self-test slice.
   - Mark the ultragoal goal record complete.

This gives Grok Build the same "durable repo-native multi-goal plans over goal artifacts" power that OMX gives Codex, using only Grok-native paths (`lfg`/`grok-build.py`, MCP, `~/.grok/plugin-data/grok-build/`).
