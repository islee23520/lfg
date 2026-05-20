# LFG Agent Orchestration System

**Goal**: Bring OmO (oh-my-openagent) level named agent + category + rigorous team orchestration into LFG, while keeping clear identity:

- **LFG** = Main orchestrator / conductor (leader)
- **ULW** = Worker identity for all team members (external CLIs and native Grok sub-agents)

**Current status (omo-parity branch)**: The canonical runtime registry now loads the 11 upstream OMO agents (`sisyphus`, `hephaestus`, `prometheus`, `atlas`, `oracle`, `librarian`, `explore`, `multimodal-looker`, `metis`, `momus`, `sisyphus-junior`) plus the `builtin-agents` policy layer from `plugins/lfg/src/agents/*.json`. They are loaded by `load_omo_agent_registry()` and exposed via `lfg agents list` / `lfg spawn`. See the "Current Runtime Implementation" section of [docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md) for the as-built wiring.

The older custom lineup below is preserved only for backward compatibility with existing team specs.

## Legacy / Compatibility Agent Lineup (pre-OMO)

| Agent Name | Role                  | Philosophy / Strength                  | Preferred Category | Notes |
|------------|-----------------------|----------------------------------------|--------------------|-------|
| **lina**   | Orchestrator (Leader) | Overall coordination, delegation, final decisions | - | Main "brain" of the team |
| **gonow**  | Workers / Executors   | Fast, reliable execution               | quick / balanced   | General purpose ULW workers |
| **iz**     | Architect             | Deep structural thinking, long-term design | deep (codex)       | High reasoning architecture work |
| **grok**   | Consultant            | High-quality advice, multi-angle review | deep + artistry    | Strong reasoning + creative input |

## Category Mapping (Grok-native OMO)

- First-class agents default to Grok models; approved optional execution providers are `codex`, `copilot`, and `zai`.
- `deep` / `ultrabrain` → high reasoning Grok profiles
- `artistry` → creative Grok profiles
- Other categories map to appropriate reasoning levels, and every completion remains gated by Grok Oracle review.

## Structure of this Design

- `agent-definitions.md` — Detailed spec for named agents (A)
- `categories.md` — Category system and model mapping (B)
- `hyperplan-teams.md` — Rigorous adversarial team templates inspired by OmO Hyperplan (C)
- `omo-parity-comparison.md` — Side-by-side comparison of OmO philosophy/agents vs LFG custom system
- `omo-runtime-implementation-plan.md` — Test-first execution plan for ROADMAP M3-M13 OMO runtime slices

This work will live on a dedicated feature branch for a clean PR.
