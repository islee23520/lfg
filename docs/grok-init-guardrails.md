# Grok Init Guardrails ADR

**Status:** Draft (2026-07-09)  
**Parent epics:** #62 #66  
**Gateway:** G3 (#72)

## Problem
Grok lacks OpenCode `experimental.chat.system.transform` / messages transform.  
OMO Claude/GPT-tuned prompts will not self-enforce on Grok 4.5 orchestrator without explicit harness policy.

## Decision
Treat hooks + SessionStart assembly as **harness policy**, not optional parity garnish.

### Required policy bundle (target)
1. **SessionStart** — inject role contract: orchestrator routes; does not silently deep-implement or vision-judge alone when specialists exist
2. **UserPromptSubmit** — ultrawork/rules/context already partial; extend with topology reminders when multi-model available
3. **SubagentStart/Stop** — worker contract + evidence expectations; continuation guidance without false reinject claims
4. **Fail-closed** — malformed hook JSON does not execute partial side effects
5. **bridge idempotency (Bridge)** — peel outer wraps, apply exactly one

### Role contracts (summary)
- Sisyphus/default: route, constrain, verify
- Hephaestus/coding: implement
- Oracle/review: prefer GPT deep when available
- Vision roles: prefer Gemini; use degrade path if blind
- Never claim teammode/continuation Grok-adapted without G5 proof

## Install ownership
- Assets live in plugin hooks/prompts under `~/.grok/plugins/lfg`
- Global registration `~/.grok/hooks/lfg-hooks.json`
- lfg setup must re-normalize hooks every run (existing invariant)

## Current vs target
| Area | Current | Target |
|------|---------|--------|
| Native hooks | present (G0 verified hooksRegistered) | keep |
| Init topology guardrails | incomplete | implement after this ADR |
| Fail-closed tests | partial | required G3 |
| bridge idempotency (Bridge) | known invariant | keep tested |

## Non-goals
- Full OpenCode transform emulator
- Mutating host auth
