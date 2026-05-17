# LFG Agent Orchestration System

**Goal**: Bring OmO (oh-my-openagent) level named agent + category + rigorous team orchestration into LFG, while keeping clear identity:

- **LFG** = Main orchestrator / conductor (leader)
- **ULW** = Worker identity for all team members (external CLIs and native Grok sub-agents)

This document series covers the design for custom agent system requested by the user.

## Desired Custom Agent Lineup

| Agent Name | Role                  | Philosophy / Strength                  | Preferred Category | Notes |
|------------|-----------------------|----------------------------------------|--------------------|-------|
| **lina**   | Orchestrator (Leader) | Overall coordination, delegation, final decisions | - | Main "brain" of the team |
| **gonow**  | Workers / Executors   | Fast, reliable execution               | quick / balanced   | General purpose ULW workers |
| **iz**     | Architect             | Deep structural thinking, long-term design | deep (codex)       | High reasoning architecture work |
| **grok**   | Consultant            | High-quality advice, multi-angle review | deep + artistry    | Strong reasoning + creative input |

## Category Mapping (from OmO)

- `deep` → **codex** (or high-reasoning Codex-style)
- `artistry` → **gemini** (creative, novel perspectives)
- Other categories to be defined (ultrabrain, quick, etc.)

## Structure of this Design

- `agent-definitions.md` — Detailed spec for named agents (A)
- `categories.md` — Category system and model mapping (B)
- `hyperplan-teams.md` — Rigorous adversarial team templates inspired by OmO Hyperplan (C)
- `omo-parity-comparison.md` — Side-by-side comparison of OmO philosophy/agents vs LFG custom system

This work will live on a dedicated feature branch for a clean PR.
