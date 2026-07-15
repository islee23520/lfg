# ULW Quality Gateway — Real Acceptance

**Status:** Active SSOT (2026-07-09)  
**Repo:** `@islee23520/lfg`  
**Umbrella:** GitHub #62  
**Gateway epic:** #68  

This document replaces vibe checklists. A gate is **PASS / FAIL / WAIVED**.  
WAIVED requires: residual path, owner, next wave, and why product risk is acceptable.

## 0. Vocabulary

| Term | Meaning |
|------|---------|
| **PASS** | All required commands exit 0 and required artifacts exist with required fields |
| **FAIL** | Any required command non-zero, missing artifact, missing field, or secret leak |
| **WAIVED** | Explicit residual recorded; cannot promote status that the gate protects |
| **Evidence root** | `.omo/evidence/gateway/<gate-id>/<YYYYMMDD-HHMMSS>/` |
| **Receipt** | JSON or text file produced by a command, redacted of secrets |

### Global hard fails (any gate)

1. API keys / tokens appear in stdout, JSON, or committed evidence
2. Claim `Grok-adapted` / Implemented for Manifest-only / Deferred without e2e proof
3. `npm publish` / version bump treated as foundation success
4. Host `~/.grok/auth.json` mutated by lfg
5. Temp-home install writes outside the temp HOME when `LFG_ALLOW_TEST_GROK_HOME=1`

---

## G0 — Install honesty

**Protects:** “setup works / plugin lands” claims  
**GitHub:** #69  
**Evidence dir:** `.omo/evidence/gateway/G0/`

### Required commands

```sh
npm run build
export LFG_ALLOW_TEST_GROK_HOME=1
HOME="$(mktemp -d /tmp/lfg-g0-XXXXXX)"
export HOME
node dist/lfg.js --json setup > "$HOME/plan.json"
node dist/lfg.js --json setup --run > "$HOME/setup-run.json"
node dist/lfg.js --json setup --run > "$HOME/setup-rerun.json"   # idempotent second run
```

### Required assertions (machine)

| ID | Check | Pass rule |
|----|-------|-----------|
| G0.1 | plan non-mutating | `plan.json` parses; no plugin tree required before run |
| G0.2 | setup ok | `setup-run.json` has `ok: true` (or equivalent success) and `postInstallVerify.ok: true` |
| G0.3 | plugin path | plugin exists under `$HOME/.grok/plugins/lfg` (or stamped install path reported) |
| G0.4 | stamp | `lfg-install.json` exists in plugin root |
| G0.5 | inventory | `lfg-component-inventory.json` exists |
| G0.6 | no secrets | evidence files match no `sk-`, `Bearer `, `api_key = "` with real-looking secrets |
| G0.7 | idempotent | second run does not report destructive reinstall unless `--force` |
| G0.8 | contract | `lfgIsPlugin` is false if present; no deprecated setup JSON keys |

### Optional but recommended

```sh
npm run assert-omo-parity
```

### PASS package

- `plan.json`, `setup-run.json`, `setup-rerun.json`
- `tree.txt` of `$HOME/.grok/plugins/lfg` (paths only)
- `MANIFEST.md` listing commands + exit codes

---

## G1 — Protocol depth (F1 dossiers)

**Protects:** skill protocol understanding claims; blocks coding “OMO complete”  
**GitHub:** #70  
**Evidence dir:** `.omo/evidence/gateway/G1/`

### Required artifacts

For each skill in:

`ulw-plan`, `start-work`, `review-work`, `ulw-loop`, `ultrawork`, `ultraresearch`, `teammode`

1. `.omo/ultraresearch/skill-dossiers/<skill>.md`
2. `.omo/evidence/skill-dossiers/<skill>.verified.json`

### Required dossier headings

`## Identity`, `## Phase graph`, `## Tool contracts`, `## Scripts I/O`, `## OMO ↔ lfg delta`, `## Residuals`, `## Proof plan`

### verified.json required keys

`name`, `matrix_id`, `depth` (`S`|`M`|`D`), `phases` (array), `tools` (array), `scripts_io` (array), `residuals` (array)

### Required commands

```sh
node - <<'JS'
const fs = require('fs');
const skills = ['ulw-plan','start-work','review-work','ulw-loop','ultrawork','ultraresearch','teammode'];
const heads = ['## Identity','## Phase graph','## Tool contracts','## Scripts I/O','## OMO ↔ lfg delta','## Residuals','## Proof plan'];
const keys = ['name','matrix_id','depth','phases','tools','scripts_io','residuals'];
let fail = 0;
for (const s of skills) {
  const md = `.omo/ultraresearch/skill-dossiers/${s}.md`;
  const js = `.omo/evidence/skill-dossiers/${s}.verified.json`;
  if (!fs.existsSync(md) || !fs.existsSync(js)) { console.error('missing', s); fail++; continue; }
  const text = fs.readFileSync(md,'utf8');
  for (const h of heads) if (!text.includes(h)) { console.error(s, 'missing heading', h); fail++; }
  const j = JSON.parse(fs.readFileSync(js,'utf8'));
  for (const k of keys) if (!(k in j)) { console.error(s, 'missing key', k); fail++; }
  if (!['S','M','D'].includes(j.depth)) { console.error(s, 'bad depth', j.depth); fail++; }
  if (j.depth === 'D') {
    const blockers = (j.residuals||[]).filter(r => /core|blocker|protocol/i.test(JSON.stringify(r)));
    // D forbids residuals marked as open core-protocol blockers
    if ((j.residuals||[]).some(r => r && r.open_blocker === true)) { console.error(s, 'D with open_blocker'); fail++; }
  }
}
process.exit(fail ? 2 : 0);
JS
```

### PASS rules

| ID | Rule |
|----|------|
| G1.1 | all 7 dossiers + verified.json exist |
| G1.2 | all headings + keys present |
| G1.3 | FEATURE-MATRIX F1 rows Depth do not claim `D` unless verified.json `depth==D` |
| G1.4 | no skill marks Depth=D with `open_blocker: true` residual |

### Explicit non-pass

Having SKILL.md installed under `skills/` alone is **not** G1 PASS.

---

## G2 — Harness policy (role × model × provider)

**Protects:** multi-model topology claims  
**GitHub:** #71  
**Evidence dir:** `.omo/evidence/gateway/G2/`

### Required artifacts

1. `docs/grok-multimodel-topology.md` (or accepted path recorded here)
2. Machine table JSON: `.omo/evidence/harness/role-model-topology.json`

### role-model-topology.json schema

```json
{
  "version": 1,
  "orchestrator": {"roles": ["default","sisyphus"], "primary_family": "grok", "primary_model": "grok-4.5", "effort": "low"},
  "deep_oracle": {"roles": ["oracle"], "primary_family": "gpt", "fallback": ["grok"]},
  "vision": {"roles": ["multimodal-looker","visual-engineering"], "primary_family": "gemini"},
  "degrade": [{"missing": "gpt", "behavior": "..."}, {"missing": "gemini", "behavior": "..."}]
}
```

### Required commands

```sh
npm run build
# unit: topology pins / recommendations
npx vitest run src/grok/models/model-recommendations*.test.ts src/grok/models/model-recommendation-patterns.test.ts src/cli/models/lfg-models.preset.test.ts
# install materialization with multi endpoints (temp home)
export LFG_ALLOW_TEST_GROK_HOME=1
HOME="$(mktemp -d /tmp/lfg-g2-XXXXXX)"; export HOME
# use discovery path available in repo tests or setup with multi base urls if configured
node dist/lfg.js --json setup --run > "$HOME/setup.json"
rg -n "\[model\." "$HOME/.grok/config.toml" || true
```

### PASS rules

| ID | Rule |
|----|------|
| G2.1 | topology ADR exists and states Grok orchestrator / GPT deep / Gemini vision |
| G2.2 | role-model-topology.json validates schema |
| G2.3 | targeted model tests green |
| G2.4 | setup materializes model sections without `endpoints.api_key` |
| G2.5 | no secrets in evidence |
| G2.6 | degrade rows exist for missing GPT and missing Gemini |

### Not enough for PASS

- only Grok-first recommendation comments
- only preferredModels arrays without topology ADR + degrade matrix

---

## G3 — Guardrail runtime

**Protects:** “hooks/init installed ⇒ safe orchestrator” claims  
**GitHub:** #72  
**Evidence dir:** `.omo/evidence/gateway/G3/`

### Required commands

```sh
npm run build
npx vitest run src/grok/hooks src/grok/doctor/post-install-verify.test.ts
export LFG_ALLOW_TEST_GROK_HOME=1
HOME="$(mktemp -d /tmp/lfg-g3-XXXXXX)"; export HOME
node dist/lfg.js --json setup --run > "$HOME/setup.json"
# inspect installed hook registration
test -f "$HOME/.grok/hooks/lfg-hooks.json" || test -f "$HOME/.grok/plugins/lfg/hooks/hooks.source.json"
```

### PASS rules

| ID | Rule |
|----|------|
| G3.1 | hook-related unit/integration tests green |
| G3.2 | temp install produces lfg hook registration source |
| G3.3 | malformed hook JSON path fail-closed test exists and green |
| G3.4 | bridge wrap idempotency test exists and green |
| G3.5 | guardrails ADR exists (`docs/grok-init-guardrails.md`) OR residual explicitly WAIVES runtime policy with risk note |

### Not enough

- hooks files copied without tests
- “Sisyphus prompt mentions discipline” only

---

## G4 — Specialist lanes (deep + vision)

**Protects:** multi-model specialist claims + multimodal claims  
**GitHub:** #73  
**Evidence dir:** `.omo/evidence/gateway/G4/`

### Split lanes

#### G4a Deep/Oracle

| ID | Pass rule |
|----|-----------|
| G4a.1 | topology assigns oracle/deep preferred family `gpt` |
| G4a.2 | override/recommendation tests assert GPT preferred when available |
| G4a.3 | missing GPT degrade path documented and test-covered |

#### G4b Vision/Multimodal

| ID | Pass rule |
|----|-----------|
| G4b.1 | multimodal ADR exists |
| G4b.2 | vision roles pin Gemini-first (or residual with reason) |
| G4b.3 | capability policy distinguishes image-in understanding vs image generation |
| G4b.4 | degrade policy for noVision / sidecar failure is written |
| G4b.5 | at least one real-surface proof: either (A) native image model path receipt, or (B) describe/degrade marker receipt, or (C) specialist spawn contract test |

### Required commands (minimum)

```sh
npx vitest run src/grok/models src/grok/flavour 2>/dev/null || true
# plus any new multimodal/topology tests once added
test -f docs/grok-multimodal-support.md || test -f docs/architecture/lfg-architecture-map.html
```

### PASS definition

- G4 PASS = G4a PASS **and** G4b PASS  
- If only docs exist → **FAIL** (or WAIVED with residual, cannot claim multimodal support Done)

### OpenCodex reference requirement

G4b ADR must cite `opencodex/src/vision` semantics: native vs sidecar vs degrade, and state which option lfg adopts.

---

## G5 — Host seam honesty

**Protects:** teammode / continuation / verifier status flips  
**GitHub:** #74  
**Evidence dir:** `.omo/evidence/gateway/G5/`

### Required artifacts

1. `.omo/ultraresearch/skill-dossiers/host-seams.md` (or equivalent)
2. Inventory/parity rows remain Deferred unless e2e proof attached

### PASS rules

| ID | Rule |
|----|------|
| G5.1 | each of teammode, start-work-continuation, lazycodex-executor-verify classified with host dependency class |
| G5.2 | app-server listed as non-runtime-dependency |
| G5.3 | no AGENTS.md/parity status flip to Grok-adapted without linked e2e receipt |
| G5.4 | MVP experiments explicitly marked non-promoting |

### Required commands

```sh
rg -n "Deferred|teammode|start-work-continuation|lazycodex-executor-verify" docs/grok-adapter-parity.md AGENTS.md
npm run assert-omo-parity
```

---

## Cross-gate release package (when claiming a train Done)

**GitHub:** #68 #96  

```sh
npm run verify
```

Must be green **if** the train touched code/docs under pack/parity surfaces.

Additionally:

1. Link G0–G5 results (PASS/FAIL/WAIVED)
2. Attach evidence roots
3. List residuals still open
4. Confirm no npm publish unless separately approved

---

## Mapping: weak checklist → real acceptance

| Old weak text | Real replacement |
|---------------|------------------|
| “evidence checklist exists” | G0–G5 command + artifact tables above |
| “capture setup JSON” | G0.2–G0.8 field assertions |
| “docs updated” | ADR path + schema JSON where required |
| “hooks installed” | G3 tests + temp hook registration |
| “vision supported” | G4b.1–G4b.5 including real-surface proof |
| “parity improved” | assert-omo-parity + no dishonest status flip (G5) |

---

## Gateway board (verified)

| Gate | Status | Why |
|------|--------|-----|
| G0 | **PASS** | `.omo/evidence/gateway/G0/20260709-163139` |
| G1 | **PASS** (Depth M honesty) | 7/7 dossiers+verified.json; pack `.omo/evidence/gateway/G1/20260709-164645` |
| G2 | **PASS** | topology ADR+JSON+validator/overrides + endpoints tests; pack `.omo/evidence/gateway/G2/20260709-164645` |
| G3 | **PASS** | hook fail-closed/idempotency + temp hooksRegistered + ADR; pack `.omo/evidence/gateway/G3/20260709-164645` |
| G4 | **PASS** | multimodal ADR + GPT oracle / Gemini vision pins; pack `.omo/evidence/gateway/G4/20260709-164645` |
| G5 | **PASS** | host-seams + Deferred honesty + assert-omo-parity; pack `.omo/evidence/gateway/G5/20260709-164645` |

Gateways closed on GitHub: #69–#74, #96, #68. Deferred substitute issues remain open intentionally.


## Operator quick card

```text
Want to start coding skill behavior?     → G1 PASS
Want to change default model topology? → G2 PASS
Want to claim hooks/guardrails Done?   → G3 PASS
Want to claim GPT deep / Gemini vision?→ G4 PASS
Want to flip team/continuation status? → G5 PASS
Want to say install is healthy?        → G0 PASS
Want to close umbrella #62?            → G0–G5 PASS or WAIVED with residuals
```
