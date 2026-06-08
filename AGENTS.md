# PROJECT KNOWLEDGE BASE

## OVERVIEW

**Spinoff product:** `lfg` is an **omo / lazycodex Grok Build adapter** (not a Linalab offering).
It is the npm entry for **Grok Build** with **omo-codex-parity install** plus built-in **extension layer**
(hooks, agent overrides — **ported from LFP ideas**, not the LFP package copied as-is). Target shape:

```sh
npx @islee23520/lfg setup
```

**Today (transition):** `setup --run` still chains `npx lazycodex-ai install` then
`npx @islee23520/lfp setup`. **Planned:** `runGrokInstall()` in lfg + **port LFP capabilities**
for Grok — see `docs/lfp-capability-port.md`, `docs/grok-adapter-ownership.md`,
`plans/lfg-omo-grok-build-adapter.md`.

The **CLI** is not a Grok plugin (`lfgIsPlugin: false`). **`setup --run`** installs the
**Grok plugin payload** (omo + ported extensions). Optional **Codex Light** home
`~/.codex` may still use `lazycodex-ai` separately.

## STRUCTURE

- `plugins/lfg/bin/lfg.ts`: CLI entrypoint for `setup`.
- `plugins/lfg/bin/lfg-installer.ts`: Chained `npx` installers (lazycodex-ai, then LFP).
- `plugins/lfg/skills/lazycodex/SKILL.md`: skill that points users to the npm installer surface.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change CLI output or routing | `plugins/lfg/bin/lfg.ts` | Keep the command set to `setup`. |
| Change installer wording or order | `plugins/lfg/bin/lfg-installer.ts` | Do not bypass upstream packages. |
| Change setup behavior | `plugins/lfg/bin/lfg.ts` | Only explicit setup may mutate `~/.grok` (via upstream installers). |
| Change user-facing skill copy | `plugins/lfg/skills/` | Lazycodex + LFP guidance via `lfg setup`. |

## CODE MAP

| Surface | Location | Role |
|---------|----------|------|
| `lfg setup` | `plugins/lfg/bin/lfg.ts` | Human-facing installer for lazycodex + LFP on Grok Build. |
| `lfg --json setup` | `plugins/lfg/bin/lfg.ts` | Non-mutating plan for both upstream installers. |
| `lfg --json setup --run` | `plugins/lfg/bin/lfg.ts` | Runs `npx lazycodex-ai install` then `npx @islee23520/lfp setup`. |
| `lazycodex` skill | `plugins/lfg/skills/lazycodex/SKILL.md` | Points users at the npm installer surface. |

## COMMANDS

```sh
npm test
npm run self-test
npm run typecheck
npm run build
plugins/lfg/bin/lfg --json setup
plugins/lfg/bin/lfg --json setup --run
```

## CONVENTIONS

- Keep output focused on **lazycodex-ai** and **@islee23520/lfp** and their `npx` commands.
- Keep npm/npx as the project toolchain; do not add Bun scripts or runtime dependencies.
- Do not describe this repository as a plugin or runtime.
- Do not add unrelated runtime or workflow features.
- Only mutate through an explicit `setup --run` surface or confirmed interactive setup.
- Never print API keys in JSON output or final logs.
- Keep CLI, package metadata, and skill copy consistent about the **two upstream installer commands** (fixed order).

## ANTI-PATTERNS

- Reintroducing broad runtime surfaces.
- Adding another installer path that bypasses `npx lazycodex-ai install` or `npx @islee23520/lfp setup`.
- Letting non-setup commands silently write into `~/.grok`.
- Expanding the helper into unrelated environment management.
- Describing `lfg` as the LFP or lazycodex plugin itself.

## NOTES

- The worktree may contain deleted legacy files from a larger previous product shape; do not revive them without an explicit request.
- Current deterministic tests are under `plugins/lfg/bin`.