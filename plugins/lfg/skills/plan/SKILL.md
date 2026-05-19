---
name: plan
description: "LFG port of OMX `plan`: Strategic planning with optional interview workflow"
user_invocable: true
metadata:
  package: "linalab-io/lfg"
  source: "oh-my-codex/plugins/oh-my-codex/skills/plan/SKILL.md"
  source_repo: "https://github.com/Yeachan-Heo/oh-my-codex"
  port_kind: "grok-skill-adapter"
---

# Plan — LFG Port

LFG port of the OMX `plan` skill from oh-my-codex.

**Where plans live**: When you create a plan through LFG (via `/plan`, the `plan` skill, `lfg plan create`, `grok_build_plan`, or Prometheus), the plan is written into the **current project's `.lfg/plans/` folder** as both:

- `<id>.json` — structured durable record
- `<id>.md` — human-readable Markdown you (and agents) can open and work on directly

This keeps plans inside the project (nested under `.lfg/plans/`) so they are version-controllable with the repo and survive across sessions, matching OMO-style durable planning.

Runtime provided by `lfg plan`, MCP `grok_build_plan`, and plugin surfaces.

## Rich Preview on Create (Automatic)

**After any successful plan creation** (from `lfg plan create`, `grok_build_plan` MCP action=create, the `plan` skill, or `/plan create "..."`), the **return value always includes a top-level `preview` object + `markdown_content`** (self-contained, no extra file reads needed).

The `preview` contains:
- `markdown`: the **full** generated Markdown (now using standard `- [ ]` task-list syntax for native interactive checkboxes)
- `steps`, metadata, `paths`
- `interactive`: supports_checkboxes, suggested_actions (edit, mark_step, spawn etc.)
- `render`: { style: "rich_card", popup: true, header, footer_note, theme }

**You MUST automatically trigger + render a nice Markdown preview popup / rich preview panel/card** using this data, instead of dumping raw text or just a file path.

**How to render the preview (beautiful, self-contained UX):**
- Show a card/popup titled "✅ Plan Created: <title>" (from render.header)
- Display the full `preview.markdown` (or reconstruct task list from steps) — this renders with **clickable checkboxes** in supporting UIs (Grok chat, markdown viewers).
- Include key metadata: ID, Created, Repo.
- Add interactive elements conceptually:
  - Checkboxes for each step (map to - [ ] / - [x])
  - "Edit" button/link → open `paths.markdown` in editor
  - "Mark complete" / "Add note" actions (map to future plan updates or direct md edit)
  - "Spawn team from this plan" using the steps as checklist
- End with the footer_note from render.
- This is the **primary user-facing output** after create — rich, visual, actionable.

Example rendered shape (what Grok should output):
```
╔════════════════════════════════════════════╗
║ ✅ Plan Created: Ship feature               ║
║ ID: plan-...  | Created: ... | Repo: ...    ║
╠════════════════════════════════════════════╣
║ ## Steps                                     ║
║ - [ ] 1. design...                           ║
║ - [ ] 2. ...                                 ║
║                                              ║
║ [Edit .md] [Mark Step 1 Done] [Spawn Team]   ║
╚════════════════════════════════════════════╝
_Full durable file: .lfg/plans/<id>.md_
```

The structured `preview` makes this 100% self-contained and deterministic for beautiful rendering across CLI json, MCP tool results, slash /plan, and the plan skill.

Use `grok_build_plan` (or equiv `lfg plan create --json`) for the create action; inspect the `result.plan.preview` (or `result.preview`) in tool output.
