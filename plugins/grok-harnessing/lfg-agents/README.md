# LFG Named Agents

This directory contains **example agent definitions** for the LFG Agent Orchestration System.

## Philosophy
- **LFG** = The main orchestrator (the conductor)
- **ULW** = The worker identity for all team members (whether they are external CLIs or native Grok sub-agents)

Every agent defined here runs with the **ULW identity** (`LFG_LAUNCHER=ulw`).

## Current Core Agents

| Name   | Role          | Default Category | Best For                          |
|--------|---------------|------------------|-----------------------------------|
| lina   | Orchestrator  | -                | Leading the team, delegation      |
| gonow  | Worker        | balanced         | General execution                 |
| iz     | Architect     | deep             | Deep structural & long-term design|
| grok   | Consultant    | deep + artistry  | High-quality advice & review      |

## File Format

Each agent is defined as `<name>.json`:

```json
{
  "name": "iz",
  "role": "architect",
  "identity": "ulw",
  "default_category": "deep",
  "subagent_type": "plan",
  "description": "..."
}
```

## Usage

```sh
lfg team create iz,gonow,grok "design review"
lfg ultragoal spawn --agents iz,gonow "implement with architecture oversight"
```

See `docs/agent-system/` for the full design.
