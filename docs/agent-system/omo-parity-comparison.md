# OmO vs LFG Agent System — Philosophy & Capability Parity Comparison

## Purpose
This document compares the agent philosophy and architecture of **oh-my-openagent (OmO)** with the emerging **LFG custom agent system** (lina, gonow, iz, grok + ULW identity + categories), so we can consciously decide what to adopt, adapt, or differentiate.

---

## 1. Core Philosophy

### OmO Philosophy
- **"Human intervention is a failure signal"** — the system should be autonomous enough that the human rarely needs to step in.
- Code produced by agents should be **indistinguishable from senior engineer work**.
- Heavy emphasis on **multi-agent teams with built-in adversarial pressure** (Hyperplan) to fight hallucination and scope creep.
- Strong belief in **orchestrating many models** rather than betting on one winner.
- Very high bar for structure, auditability, and process (mailbox, tasklist, explicit handoffs, validation).

### LFG / User's Philosophy (so far)
- **LFG = Conductor**, **ULW = Worker identity**.
- Maximize **whatever coding CLIs are actually installed** on the user's machine (pragmatic, not ideological).
- Strong preference for **named, reusable, purpose-specific agents** (lina=orchestrator, gonow=workers, iz=architect, grok=consultant).
- Deep roles should get **high-reasoning + multi-AI consultation** (codex for deep, gemini for artistry).
- Keep the system **flexible and powerful** for both casual and high-stakes work.
- Maintain clear separation: leader (LFG) owns the durable state (Ultragoal), workers (ULW) produce evidence.

**Key Difference**:
- OmO is more "opinionated excellence" (enforce high standards).
- LFG is more "pragmatic power + identity" (use what you have, but with strong named personas and ULW branding).

---

## 2. Agent Model Comparison

| Aspect                    | OmO                                      | LFG (Proposed)                              | Parity Gap | Recommendation |
|---------------------------|------------------------------------------|---------------------------------------------|------------|----------------|
| Named Agents              | subagent_type + dynamic categories       | Explicit named agents (lina, iz, grok...)  | Medium     | Adopt + extend |
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
5. **AST-Grep + LSP** as native superpowers for code agents (huge for iz and grok roles).

## 4. LFG Differentiators We Should Keep / Strengthen

1. **ULW as universal worker identity** — even native Grok sub-agents feel like they belong to the LFG swarm.
2. **Pragmatic multi-CLI maximization** — not forcing users into one ecosystem.
3. **Tight Ultragoal integration** — durable goal + ledger as the single source of truth (very strong in current LFG).
4. **Named agents as first-class citizens** (lina, iz, etc.) with personality — this is the user's unique flavor.
5. **Grok-native sub-agents** as a first-class backend (OmO is more CLI-centric).

---

## 5. Recommended Stance

We are not copying OmO 1:1. We are **building a LFG-flavored orchestration system** that:

- Borrows the best structural ideas (Hyperplan, categories, named agents, mailbox/tasklist)
- Keeps the pragmatic "use whatever is installed" spirit
- Centers everything around **LFG (orchestrator) + ULW (workers)**
- Makes the user's specific lineup (lina / gonow / iz / grok) feel powerful and natural

This positions LFG as a **distinct but compatible** evolution in the agent orchestration space.

---

## 6. Next Actions After This Document

- Finalize the Agent Definition + Category schemas
- Implement minimal registry + loader
- Add `hyperplan` as the first official team template
- Start wiring AST-Grep and LSP as first-class tools for `iz` and `grok` agents
- Document the philosophy clearly so future contributors understand the LFG vs OmO difference

This comparison will live in the PR as `docs/agent-system/omo-parity-comparison.md`.
