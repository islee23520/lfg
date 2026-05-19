# LFG Agent Definitions

This directory is the canonical lfg-native agent registry for the Grok Build plugin.

## First-Class Agents

The runtime loads these files directly for `lfg agents list`, `lfg agents inspect`, spawn planning, MCP agent inspection, and smoke contracts:

- `sisyphus.json` — main orchestrator
- `sisyphus-junior.json` — bounded category executor
- `prometheus.json` — planning agent
- `hephaestus.json` — autonomous deep worker
- `atlas.json` — checklist/dependency-wave executor
- `builtin-agents.json` — model/category/policy resolver

All first-class agents use `provider: xai` and `model: xai/grok-4.3`.

## Legacy Compatibility

`legacy/` contains older Lina, GoNow, IZ, and Grok named-agent definitions kept only for existing team specs such as `iz,gonow,grok`. They are not part of the first-class OMO registry.
