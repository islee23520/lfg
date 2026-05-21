# Agent Hierarchy

`lfg` uses the upstream OMO agent registry as its canonical runtime set. The first-class JSON definitions under `plugins/lfg/src/agents/` are loaded at runtime by `load_omo_agent_registry()`.

## Primary Agents and Registry

| Agent | Family | Role | Reasoning | Key Categories |
|-------|--------|------|-----------|----------------|
| **Sisyphus** | orchestrator | Main orchestrator. Owns user intent, dispatches specialists, tracks completion, enforces verification, and persists progress through Boulder. | high | quick, unspecified-*, ultrabrain, deep, artistry, visual-engineering, planning |
| **Sisyphus-Junior** | executor | Bounded category executor. Executes a focused task within one category, verifies its own changes, and does not become a second unconstrained orchestrator. | medium / high (by category) | quick, unspecified-low, writing, visual-engineering |
| **Prometheus** | planner | Strategic planner. Interviews, clarifies scope, reads context, and produces a verifiable plan before implementation starts. | high | planning |
| **Hephaestus** | deep-worker | Autonomous deep worker. Receives goals (not recipes), researches, implements, and verifies difficult work with strong evidence discipline. Requires approved GPT-style deep-specialist profile. | medium | deep, ultrabrain, artistry |
| **Atlas** | checklist | Todo-list orchestrator. Reads a plan, executes dependency waves, updates checkboxes, verifies every step, and continues until the checklist is complete. | high | unspecified-high |
| **builtin-agents** | policy | Factory and policy layer. Resolves model profile, category, skill availability, overrides, blocked tools, and registration conditions. | low | policy, configuration |

The runtime registry also includes the specialist OMO agents `oracle`, `librarian`, `explore`, `multimodal-looker`, `metis`, and `momus`.

## Model Resolution

Most agents hard-require the Grok execution family by default:
- `provider: "xai"`
- `model: "xai/grok-4.3"`

Hephaestus is the intentional exception from upstream OMO model matching: it requires an approved GPT-style profile (`openai/gpt-5.5` or Copilot GPT-5.5). `resolve_omo_model_profile()` blocks mismatched cheap, utility, or non-GPT Hephaestus overrides and maps other agents' category → reasoning level.

## Legacy Agents

Older custom names (`lina`, `gonow`, `iz`, `grok`) are historical only. They are not bundled in the current plugin and are not valid team-spec members.

## How Agents Are Used

- `lfg agents list` / `lfg --json agents list`
- `lfg agents inspect <agent> --category <c>`
- `lfg spawn <agent> --category <c> --task "..."` (via Grok Spawn Adapter)
- MCP tools: canonical short names `omo_agent_catalog`, `omo_doctor`

## Verification

Every agent JSON is validated during:
- `bun plugins/lfg/bin/self-test.ts`
- `lfg doctor`
- `lfg --json doctor state schema check`

If any agent is missing or malformed, the smoke fails with a clear `*=ok` contract violation.

---

**See also**: [How It Works](./How-It-Works.md), [Team Mode](./Team-Mode.md)
