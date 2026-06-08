# ULW evidence bundle — lfg omo Grok adapter

**Machine index:** [`.omo/plan-evidence/lfg-omo-grok-adapter.json`](../../../plan-evidence/lfg-omo-grok-adapter.json)  
**Plan:** `plans/lfg-omo-grok-adapter.md`  
**Epic:** [#26](https://github.com/islee23520/lfg/issues/26)

## Verification logs (no secrets)

| Artifact | Role |
|----------|------|
| `../loop-019ea7dad1d5-run128-verify.txt` | Latest full `npm run verify` (216 tests) |
| `../loop-019ea7dad1d5-run127-verify.txt` | cleanup N/A #34 + CI Node #12 |
| `../loop-019ea7dad1d5-run120-verify.txt` | Plan evidence + plugin cache (#27/#35) |
| `../loop-019ea7dad1d5-run118-verify.txt` | Publish-gap + ADR evidence |
| `../loop-019ea7dad1d5-run117-verify.txt` | npm-publish-root-contract |

## Task evidence (representative)

| Task | Tests / notes |
|------|----------------|
| Plugin cache + stamp (#27) | `plugins/lfg/grok-install/plugin-cache-install.acceptance.test.ts` |
| Doctor pack layout (#25) | `plugins/lfg/bin/doctor-pack-layout.acceptance.test.ts` |
| Setup/doctor JSON (#21) | `plugins/lfg/bin/setup-doctor-parity.test.ts` |
| npm bin (#22) | `publish-owner-checklist.test.ts`, `npm-publish-root-contract.test.ts` |
| User-facing + parity (#33) | `user-facing-copy.test.ts`, `grok-adapter-parity-doc.test.ts` |
| Extension hooks (#32) | `post-install-ported-hooks.test.ts` |

Do not commit API keys or `api_key` values in this tree.