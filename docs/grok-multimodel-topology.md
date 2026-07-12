# Grok Multimodel Topology ADR

**Status:** Draft (2026-07-09)  
**Parent epics:** #62 #64  
**Gateway:** G2 (#71)  
**Complements:** `docs/architecture/ulw-quality-gateway.md`, `docs/architecture/lfg-architecture-map.html` §11/§14

## Decision
lfg on GrokBuild uses a **Grok-centric multi-provider harness**:

| Lane | Primary family | Primary model (when available) | Effort | Fallback |
|------|----------------|----------------------------------|--------|----------|
| Orchestrator (default/sisyphus) | Grok | `grok-4.5` | low | grok-4.20-reasoning → gpt-5.5 |
| Plan lead (prometheus/plan) | Grok | `grok-4.5` | xhigh | grok-4.20-reasoning → gpt-5.5 |
| Deep / Oracle | GPT | `gpt-5.5` | high/xhigh | grok-4.5 → glm |
| Vision specialist | Gemini | `gemini-3.1-pro-*` / pro-high class | medium/low | gpt vision-capable → later Z.AI |
| Fast explore/librarian | Grok mini/composer or GPT mini | composer/mini | low/medium | cross-family mini |
| Coding executor | Grok composer/non-reasoning | composer / non-reasoning | medium | gpt-5.5 / glm |

## Why not OMO Claude-first as-is
OMO role chains and prompt builders assume Claude/GPT/Gemini behaviors. Grok as orchestrator changes compliance/style; copying Claude prompts without guardrails is insufficient. **protocol parity ≠ model-behavior parity**.

## Host surface
Grok already supports multi-provider via `~/.grok/config.toml`:
- `api_backend`: `chat_completions` | `responses` | `messages` (Claude)
- `[model.*] base_url`, `env_key`, `extra_headers`
- `[endpoints].models_base_url`

lfg materializes discovery into that surface; it does **not** reimplement OpenCodex/cliproxy.

## Degrade matrix
| Missing | Behavior |
|---------|----------|
| GPT | Oracle/deep fall back to Grok high; mark residual “second opinion weakened” |
| Gemini | Vision falls back to GPT vision-capable if present, else specialist spawn fails soft + degrade marker |
| Grok | Invalid for this product topology; setup should fail closed or force host Grok availability |
| All non-Grok | Grok-only mode allowed but G2 cannot claim full multi-model Done |

## Machine SSOT
`.omo/evidence/harness/role-model-topology.json`

## Non-goals
- Owning host OIDC `auth.json`
- Silent cross-adapter fallback between coding tool adapters
- Claiming Claude behavioral equivalence

## Open work
- Wire pins into overrides/tests (#83)
- Claude `messages` backend emission (#84)
- Gateway discovery hardening (#85)
