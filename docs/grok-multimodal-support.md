# Grok Multimodal Support ADR

**Status:** Draft (2026-07-09)  
**Parent epics:** #62 #65  
**Gateway:** G4 (#73)  
**Reference:** `~/workspace/ULW/opencodex/src/vision` (`planVisionSidecar`, `describeImagesInPlace`, `describeImage`)

## Decision
Support multimodal as layered policy, not a single model swap.

### Layers
1. **Capability truth** — per-model image-in / image-out / text-only
2. **Native vision path** — if model can see images, pass structured image parts
3. **Describe/degrade path** — if noVision, describe via sidecar/specialist or inject fail-soft marker; **never abort main turn**
4. **Vision specialist roles** — Gemini-first (`visual-engineering`, `multimodal-looker`)
5. **Protocol skills** — `visual-qa` remains judgment protocol (diff scripts + oracles)
6. **Generation** — xAI image/video MCP is **not** understanding
7. **Confirmation** — optional `agy --print` second opinion emits `<lfg-agy-vision-confirm>` and always fails open

## OpenCodex lessons adopted
| OpenCodex rule | lfg adoption |
|----------------|--------------|
| Keep structured image parts; never inline huge data URLs as text | Adopt |
| `noVisionModels` triggers describe sidecar | Adopt semantics; runtime owner TBD |
| Sidecar default GPT mini vision via forward auth | Optional if OpenCodex/proxy present; not hard dep |
| Sidecar failure degrades | Adopt hard rule |
| Bounded concurrency + desc caps | Adopt when implementing sidecar |

## Runtime ownership options (must pick in M2)
- **A.** Recommend OpenCodex (or compatible proxy) in front of endpoints for noVision models
- **B.** lfg/Grok helper tool that describes images before worker continues
- **C.** Host-native only + mandatory vision specialist spawn for visual work

The external confirmation path uses option C for the primary result and an optional Antigravity second opinion. Missing, timed-out, failed, or uncertain agy confirmation never aborts the Codex result.

## Non-goals
- Hard require ChatGPT login for all lfg users
- Equating xAI Imagine generation with screenshot understanding
- Shipping OpenCodex inside `@islee23520/lfg` core

## Acceptance pointers
See G4 in `docs/architecture/ulw-quality-gateway.md`.
