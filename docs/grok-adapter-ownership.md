# Grok adapter ownership (ADR)

**Status:** Accepted (2026-06-08, user correction after ulw-plan review)  
**Supersedes:** Plan appendix “Option B — LFP owns adapter”

## Product framing

**`lfg` is a personal spinoff:** the **GrokBuild port** and **Grok Build plugin payload** (core **codex adapter** feature + **opencode** from https://github.com/code-yeongyu/oh-my-openagent) for **oh-my-openagent / lazycodex (omo)** — analogous to `omo-codex` on Codex. It installs **native first-party OMO hooks** (bridge fallback only for legacy/imported hooks) and Grok agent/prompt surfaces, including the Hephaestus-like default agent discipline. Install-only (`setup --run --install-only`) materializes and verifies native agent/role/prompt surfaces: receipts report `postInstallVerify.nativeAgents.status: "verified"` (shorthand `nativeAgentsStatus: "verified"`). Install-only still omits agent override files, lfg runtime config, and model discovery routes. Full native OMO agent **behavioral** parity is not proven by install-only surface verification alone. User-facing copy, package metadata, marketplace IDs, and vendored code must **not** present Linalab identity, `linalab.io`, or `linalab` Codex marketplaces. Workspace folder names on a dev machine are not part of the shipped story. The npm package/JSON contract keeps `lfgIsPlugin: false` because the package object itself is not reported as a Grok plugin object; `setup --run` still installs the lfg-owned Grok plugin payload under `~/.grok/plugins/lfg`.

## Decision

**`@islee23520/lfg` is the single npm surface** for this **omo Grok adapter** (+ built-in extensions). Registry publish contract: [`docs/npm-publish.md`](npm-publish.md) (closes #22).

1. **omo-style Grok adapter** — install/verify semantics comparable to `omo-codex` on `~/.grok` (adapter tree, config merge, Grok agent/prompt payloads, **native first-party OMO hooks**, verification). **Bridge fallback** only for legacy/imported hooks. Scoped Grok-first **OMO parity**.
2. **LFP-equivalent extensions** — capabilities from legacy `@islee23520/lfp` (hooks, agent overrides, optional extra agents) are **re-implemented for Grok** inside lfg — **not** a copy-paste vendor of the LFP package. See `docs/lfp-capability-port.md`.
3. **Project `.omo` hook context** — lfg owns the Grok hook-time bridge (fallback) that reads project-local `.omo/boulder.json`...

**`@islee23520/lfp`** remains a separate npm package only if needed for **Codex-only** or legacy consumers; **Grok Build path is `npx @islee23520/lfg setup` only.**

## Terminology (avoid confusion)

| Term | Meaning |
|------|---------|
| **lfg as Grok plugin** | `lfg` **is** the omo/lazycodex Grok Build plugin. The npm CLI installs the plugin payload under `~/.grok/plugins/lfg`. |
| **`lfgIsPlugin: false` JSON contract** | The package object is not reported as a Grok plugin object in JSON output; this does not change the installed Grok Build plugin payload under `~/.grok/plugins/lfg`. |
| **Grok adapter payload** | What `setup --run` installs under `~/.grok` — **omo core + ported extension features**, shipped **by** lfg. |
| **LFP (legacy name)** | Reference for **which features to port**; not a subtree copied into this repo. |

## Homes

| Home | Owner | Contents |
|------|--------|----------|
| `~/.codex` | Optional `npx lazycodex-ai install` (bootstrap / Codex Light) | omo Codex cache when user still uses Codex |
| `~/.grok` | **`lfg setup --run`** | Grok plugin(s), `config.toml` merge, models via discovery / `LAZYCODEX_*` |

Dual-home is allowed; Grok users are not required to run Codex.

## Source of truth for implementation

| Capability | Where it lives (target) |
|------------|-------------------------|
| Grok install + verification + cleanup | `src/cli/` + `src/grok/` |
| Extension hooks / agent overrides | **Ported** per `docs/lfp-capability-port.md` into `src/extensions/` (or grok-install modules) — **new Grok-native code** |
| omo component parity | Vendor or sync from `oh-my-openagent/packages/omo-codex/plugin` — not duplicate maintenance in lfg forever without sync script |
| Model discovery | Existing `lfg-models.ts` + `lfg-grok-config.ts` until install owns full merge |

## What lfg must not do

- Ship or document **Linalab** company/product identity (this repo is an **omo Grok adapter spinoff** only).
- The CLI is the installer entrypoint; the installed payload under `~/.grok/plugins/lfg` is the Grok plugin.
- Require users to run **`npx @islee23520/lfp setup`** after lfg for the default Grok story (deprecated path; may log migration notice).
- Bypass **`npx lazycodex-ai install`** silently if product still needs Codex bootstrap — document in `setup` plan steps.

## Upstream

- oh-my-openagent has **no** `platform=grok`; parity is **lfg-owned**, optionally contributing PRs upstream later.

## Evidence

- Plan: `plans/lfg-omo-grok-build-adapter.md`
- Port map: `docs/lfp-capability-port.md`
- Upstream reference: `oh-my-openagent/packages/omo-codex` (Codex); Grok parity owned here
