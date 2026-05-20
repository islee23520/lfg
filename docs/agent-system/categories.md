# B. Category Mapping System (Reasoning Styles & Model Preferences)

## Goal
Bring OmO's powerful category system into LFG so that different thinking styles can be explicitly requested and mapped to the best available backend (installed CLIs or native Grok sub-agents).

## Current Mapping (M13 Lock)

| Category | Provider | Model | Reasoning | When to Use |
|----------|----------|-------|-----------|-------------|
| **quick** | xai | grok-4.3 | low | Fast, practical execution |
| **deep** | xai | grok-4.3 | high | Thorough, rigorous analysis |
| **ultrabrain** | xai | grok-4.3 | high | Maximum depth synthesis |
| **artistry** | xai | grok-4.3 | high | Creative, novel connections |
| **visual-engineering** | xai | grok-4.3 | high | UI/UX and visual design |
| **writing** | xai | grok-4.3 | high | Prose and documentation |
| **unspecified-low** | xai | grok-4.3 | low | Default low-reasoning |
| **unspecified-high** | xai | grok-4.3 | high | Default high-reasoning |

Approved optional execution providers (`codex`, `copilot`, `zai`) may be used for execution lanes, but every completion remains gated by Grok Oracle review.

## How Categories Work in LFG

1. Categories live in a central registry (JSON).
2. Each category defines:
   - Preferred providers (ordered)
   - Default reasoning effort
   - Prompt augmentation (injected into `build_worker_prompt`)
   - Tool bias (e.g., deep loves AST-Grep + LSP)

3. When a named agent (iz, grok, etc.) is used, its `default_category` is applied unless overridden.

Example category definition (`deep.json`):

```json
{
  "name": "deep",
  "display_name": "Deep Reasoning",
  "preferred_providers": ["codex", "claude", "grok"],
  "reasoning_effort": "high",
  "prompt_additions": [
    "Take maximum thinking depth. Consider second and third order effects.",
    "Use structured reasoning: Problem → Options → Analysis → Risks → Recommendation"
  ],
  "recommended_tools": ["ast_grep", "lsp_find_references", "code_review"]
}
```

## Integration Points

- `resolve_providers_for_role()` / `resolve_providers_for_agent()` will consult the category.
- When spawning a `grok` sub-agent for a "deep" category agent → use `subagent_type="plan"` + high-reasoning instructions.
- For external CLIs (e.g. `opencode -p` for deep, plain for quick).

## Philosophy Alignment

This directly supports the user's goal:
- **codex** for serious deep work (IZ, Grok consultant)
- **gemini** for creative/artistic angles
- Keeps the system flexible to whatever the user has installed, while allowing strong defaults.

This layer makes the "iz architect + deep (codex)" or "grok consultant + artistry (gemini)" combinations feel natural and powerful.
