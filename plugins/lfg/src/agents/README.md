# LFG Agent Definitions

This directory is the canonical lfg-native agent registry for the Grok Build plugin.

## First-Class Agents

The runtime loads these files directly for `lfg agents list`, `lfg agents inspect`, spawn planning, MCP agent inspection, and smoke contracts:

- `sisyphus.json` — main orchestrator
- `hephaestus.json` — autonomous deep worker
- `prometheus.json` — planning agent
- `atlas.json` — checklist/dependency-wave executor
- `oracle.json` — read-only plan compliance reviewer
- `librarian.json` — documentation search specialist
- `explore.json` — read-only codebase explorer
- `multimodal-looker.json` — visual / multimodal inspector
- `metis.json` — gap analyzer and pre-plan critic
- `momus.json` — ruthless reviewer / validator
- `sisyphus-junior.json` — bounded category executor
- `builtin-agents.json` — model/category/policy resolver

Loaded agents default to Grok profiles except Hephaestus, which follows the OMO deep-specialist contract and requires an approved GPT-style profile (`openai/gpt-5.5` or Copilot GPT-5.5). Hephaestus refuses cheap, utility, or mismatched model-family overrides instead of silently degrading.

## Team Eligibility

- Eligible: `sisyphus`, `atlas`, `sisyphus-junior`
- Conditional: `hephaestus`
- Hard-reject: `prometheus`, `oracle`, `librarian`, `explore`, `multimodal-looker`, `metis`, `momus`, `builtin-agents`

## Legacy Compatibility

`legacy/` contains older Lina, GoNow, IZ, and Grok named-agent definitions kept only for existing team specs such as `iz,gonow,grok`. They are not part of the first-class OMO registry.
