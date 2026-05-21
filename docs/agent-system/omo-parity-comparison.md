# OmO vs LFG Agent System — Philosophy & Capability Parity Comparison

## Purpose
This document compares the agent philosophy and architecture of **oh-my-openagent (OmO)** with the historical pre-OMO LFG custom agent system (lina, gonow, iz, grok + ULW identity + categories), so we can see what was replaced, what survived, and what was intentionally ported into the canonical OMO runtime.

---

## 1. Core Philosophy

### OmO Philosophy
- **"Human intervention is a failure signal"** — the system should be autonomous enough that the human rarely needs to step in.
- Code produced by agents should be **indistinguishable from senior engineer work**.
- Heavy emphasis on **multi-agent teams with built-in adversarial pressure** (Hyperplan) to fight hallucination and scope creep.
- Strong belief in **orchestrating many models** rather than betting on one winner.
- Very high bar for structure, auditability, and process (mailbox, tasklist, explicit handoffs, validation).

### Historical LFG / User Philosophy (pre-canonical OMO runtime)
- **LFG = Conductor**, **ULW = Worker identity**.
- Maximize **whatever coding CLIs are actually installed** on the user's machine (pragmatic, not ideological).
- Strong preference for **named, reusable, purpose-specific agents** before the OMO registry replaced them.
- Deep roles were envisioned to get **high-reasoning + multi-AI consultation**.
- Keep the system **flexible and powerful** for both casual and high-stakes work.
- Maintain clear separation: leader (LFG) owns the durable state (Ultragoal), workers (ULW) produce evidence.

**Key Difference**:
- OmO is more "opinionated excellence" (enforce high standards).
- LFG is more "pragmatic power + identity" (use what you have, but with strong named personas and ULW branding).

---

## 2. Agent Model Comparison

| Aspect                    | OmO                                      | LFG (Proposed)                              | Parity Gap | Recommendation |
|---------------------------|------------------------------------------|---------------------------------------------|------------|----------------|
| Named Agents              | subagent_type + dynamic categories       | Historical custom names before OMO port    | Medium     | Replaced by canonical OMO registry |
| Identity Branding         | Agent name + category                    | Strong "ULW worker" identity for all       | LFG stronger in branding | Keep ULW |
| Reasoning Levels          | quick / deep / ultrabrain / artistry     | Same categories mapped to backends         | Low        | Direct port |
| Model Mapping             | Config-driven per category               | Explicit (deep=codex, artistry=gemini)     | Similar    | Good match |
| Adversarial Teams         | Hyperplan with required categories + validation | Hyperplan templates + validation           | Medium     | Port the pattern |
| Sub-agent Spawning        | Very mature (tmux-subagent, delegation)  | Basic `spawn_subagent` + ULW prompt        | OmO ahead  | Improve in Phase 5 |
| Tool Specialization       | Per-agent tool restrictions + categories | Currently role-based, will become agent-based | Medium     | Adopt OmO model |
| Team Templates            | Named teams in ~/.omo/teams/             | Proposed `hyperplan`, custom templates     | OmO ahead  | Implement |

---

## 3. Strengths We Should Steal from OmO

1. **Hyperplan adversarial structure** — extremely effective for high-stakes decisions.
2. **Category + reasoning level system** — clean way to control depth vs speed.
3. **Agent eligibility & validation** — prevents bad team compositions.
4. **Mailbox + Tasklist** as first-class coordination primitives (beyond just prompts).
5. **AST-Grep + LSP** as native superpowers for code agents.

## 4. LFG Differentiators We Should Keep / Strengthen

1. **ULW as universal worker identity** — even manual-gated Grok sub-agent fallback envelopes feel like they belong to the LFG swarm.
2. **Pragmatic multi-CLI maximization** — not forcing users into one ecosystem.
3. **Tight Ultragoal integration** — durable goal + ledger as the single source of truth (very strong in current LFG).
4. **ULW worker identity** as a strong branding layer over canonical OMO execution.
5. **Grok-discoverable OMO agent wrappers plus fallback envelopes**: T28 manual evidence proves native child-spawn collection for plugin agents, while deterministic fallback envelopes remain the dependency-free backend (OmO is more CLI-centric).

---

## 5. Recommended Stance

We are not copying OmO 1:1. We are **building a LFG-flavored orchestration system** that:

- Borrows the best structural ideas (Hyperplan, categories, mailbox/tasklist)
- Keeps the pragmatic "use whatever is installed" spirit
- Centers everything around **LFG (orchestrator) + ULW (workers)**
- Preserves the historical custom lineup as reference material only, while current runtime uses canonical OMO agents

This positions LFG as a **distinct but compatible** evolution in the agent orchestration space.

---

## 6. Implementation Status (M13 Lock)

- [x] Finalize the Agent Definition + Category schemas (done — `plugins/lfg/src/agents/*.json`).
- [x] Implement minimal registry + loader (done — `load_omo_agent_registry()` in `lfg.ts`).
- [x] Add `hyperplan` as the first official team template (done — `hyperplan` skill + CLI).
- [x] Start wiring AST-Grep and LSP as first-class tools for specialist OMO agents (done — OMO agent toolsets).
- [x] Document the philosophy clearly (done — this document).
- [x] Port OMO durable research patterns (Prometheus interview + Momus critic + notepads + boulder) into `ulw` and `.lfg/` (done — `ulw` skill, `start-work` skill, Boulder state).

This comparison will live in the PR as `docs/agent-system/omo-parity-comparison.md`. Cross-reference: docs/ARCHITECTURE.md for OMO dev-branch synthesis on Hephaestus/Prometheus/deep category/boulder/notepads/hyperplan for autoresearch-goal.
