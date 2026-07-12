# docs

## OVERVIEW

Adapter decision records and capability docs. Prose here is a **tested contract**, not free-form reference.

## WHERE TO LOOK

Every doc has a 1:1 `*-doc.test.ts` under `src/cli/docs/` (exception: `npm-publish.md` → `src/cli/publish/workflow/npm-publish-doc.test.ts`) that asserts exact phrases and forbidden copy. Editing a doc means editing its test in the same change.

| Doc | Test |
|-----|------|
| `grok-adapter-ownership.md` | `src/cli/docs/grok-adapter-ownership-doc.test.ts` |
| `grok-adapter-parity.md` | `src/cli/docs/grok-adapter-parity-doc.test.ts` |
| `grok-adapter-agent-model-source-map.md` | `src/cli/docs/grok-adapter-agent-model-source-map-doc.test.ts` |
| `grok-cleanup-update.md` | `src/cli/docs/grok-cleanup-update-doc.test.ts` |
| `grok-config-endpoints.md` | `src/cli/docs/grok-config-endpoints-doc.test.ts` |
| `grok-host-auth.md` | `src/cli/docs/grok-host-auth-doc.test.ts` |
| `lfp-capability-port.md` | `src/cli/docs/lfp-capability-port-doc.test.ts` |
| `npm-publish.md` | `src/cli/publish/workflow/npm-publish-doc.test.ts` |

## CONVENTIONS

- Tests assert required phrases verbatim (e.g. `lfgIsPlugin: false`, `~/.grok/plugins/lfg`, `setup --run`, `GrokBuild port`) and issue anchors (`closes #22`, `#21`).
- Deprecated identity copy must stay absent — a `DEPRECATED_IDENTITY_COPY` regex forbids "not a Grok plugin/runtime", "setup helper/adapter package only".
- Never introduce `linalab product` framing; tests grep for it case-insensitively.
- Prefer tightening assertions over broadening them when copy changes.

## ANTI-PATTERNS

- Editing doc prose without running its matching `*-doc.test.ts`.
- Weakening or deleting a phrase assertion just to land a wording change.
- Adding a doc without a paired test — an untested doc drifts silently.
- Renaming a doc without renaming/adding the matching test (the mapping is by filename stem).
