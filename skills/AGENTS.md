# skills

## OVERVIEW

Tarball-shipped skill tree under npm `files`. Three skill roots must stay in parity: `skills/`, `src/grok/skills/`, `dist/grok-install/skills/`.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Sync driver | `../scripts/sync-omo-skills-to-grok.mjs` | Writes managed skills into `skills/` + `src/grok/skills/`. |
| Parity gate | `../scripts/assert-omo-parity.mjs` | Manifest, managed skills, supplemental xai-*, no `openai.yaml`. |
| Smoke gate | `../scripts/assert-skills-smoke.mjs` | Every `skills/*/SKILL.md` frontmatter + script syntax + cheap behavioral probes; mirrors + installed plugin. `npm run assert-skills-smoke`. |
| Sync marker | `.lfg-omo-skill-sync.json` | Provenance / upstream version. |
| Hand-maintained | `lfg/`, `cua-driver/`, `xai/`, `xai-*`, `claude-code-inventory/`, `ulw-external-engine/` | Not overwritten by managed sync list. |
| Managed OMO skills | most other dirs | Edit via sync adapters only; do not hand-patch bulk trees. |

## CONVENTIONS

- Upstream refresh: run sync script; do not invent parity by copying files by hand.
- lfg conversions at sync time: `lfg-doctor`, `lfg-report-bug`, `lfg-contribute-bug-fix` (+ `openai.yaml` → `grok.yaml`).
- `npm test` excludes `src/grok/skills/**/*.test.ts` — skill tree tests are not the package suite.
- Status honesty for deferred skills (`teammode`, etc.) lives in root `AGENTS.md` / inventory — skill presence ≠ behavioral port.

## ANTI-PATTERNS

- Hand-editing managed OMO skill payloads except through the sync script.
- Reintroducing retired `lcx-*` skill dirs.
- Claiming Grok-adapted behavior from skill files alone without hook/MCP/runtime proof.
- Editing `dist/grok-install/skills` directly (generated).
