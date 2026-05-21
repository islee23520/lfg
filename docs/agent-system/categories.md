# B. Category Mapping System (Reasoning Styles & Model Preferences)

## Goal
Bring OmO's powerful category system into LFG so that different thinking styles can be explicitly requested and mapped to the best available backend (installed CLIs or manual-gated Grok sub-agent fallback envelopes).

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

3. When a first-class OMO agent or category-backed worker is used, its allowed categories and model profile are resolved through the canonical registry unless explicitly overridden.

Example category definition (`deep.json`):

```json
{
  "name": "deep",
  "display_name": "Deep Reasoning",
  "preferred_providers": ["xai", "codex", "copilot", "zai"],
  "reasoning_effort": "high",
  "prompt_additions": [
    "Take maximum thinking depth. Consider second and third order effects.",
    "Use structured reasoning: Problem → Options → Analysis → Risks → Recommendation"
  ],
  "recommended_tools": ["ast_grep", "lsp_find_references", "code_review"]
}
```

## Integration Points

- `resolve_omo_model_profile()` and category routing consult the category mapping.
- When spawning a canonical OMO bounded worker for a `deep` or `ultrabrain` task, the runtime resolves the approved Grok-first profile and verification gate.
- For explicit non-Grok execution lanes when approved optional providers are configured.

## Philosophy Alignment

This directly supports the user's goal:
- Grok-first category routing with approved optional execution lanes where explicitly configured
- Optional creative consultation lanes for artistic angles, without replacing the xAI/Grok Oracle gate
- Keeps the system flexible to whatever the user has installed, while allowing strong defaults.

This layer makes combinations like `sisyphus-junior + artistry`, `hephaestus + deep`, or `atlas + planning` feel natural while preserving mandatory xAI/Grok Oracle review.
