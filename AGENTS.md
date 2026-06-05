# PROJECT KNOWLEDGE BASE

## OVERVIEW

`lfg` is an npm/Node TypeScript adapter setup helper around:

```sh
npx lazycodex-ai install
```

It is not a plugin. It does not own a Grok or lazycodex runtime. Its job is to set up or locate the `lazycodex` Codex adapter under `~/.grok`.

## STRUCTURE

- `plugins/lfg/bin/lfg.ts`: CLI entrypoint for `setup`, `doctor`, and `dry-setup`.
- `plugins/lfg/skills/lazycodex/SKILL.md`: skill that points users to the npm installer and adapter root.
- `tests/AGENTS.md`: test-scope rules.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change CLI output or routing | `plugins/lfg/bin/lfg.ts` | Keep the command set to `setup`, `doctor`, and `dry-setup`. |
| Change installer wording | `plugins/lfg/bin/lfg.ts` | Source of package and command metadata. |
| Change dry setup behavior | `plugins/lfg/bin/lfg.ts` | Do not hide global mutations here. |
| Change user-facing skill copy | `plugins/lfg/skills/lazycodex/SKILL.md` | Keep it about installing the lazycodex adapter. |

## CODE MAP

| Surface | Location | Role |
|---------|----------|------|
| `lfg setup` | `plugins/lfg/bin/lfg.ts` | Human-facing installer for `npx lazycodex-ai install`. |
| `lfg --json setup` | `plugins/lfg/bin/lfg.ts` | Emits the setup plan for `npx lazycodex-ai install`. |
| `lfg --json setup --run` | `plugins/lfg/bin/lfg.ts` | Explicitly runs `npx lazycodex-ai install`. |
| `lfg --json dry-setup` | `plugins/lfg/bin/lfg.ts` | Emits the non-mutating setup plan. |
| `lfg --json doctor` | `plugins/lfg/bin/lfg.ts` | Reports minimal installer readiness without mutation. |
| `lazycodex` skill | `plugins/lfg/skills/lazycodex/SKILL.md` | Tells users how to run the npm installer and where grok-build should find the adapter. |

## COMMANDS

```sh
npm test
npm run self-test
npm run typecheck
npm run build
npm exec --workspace lfg -- lfg --json dry-setup
plugins/lfg/bin/lfg --json setup
plugins/lfg/bin/lfg --json setup --run
plugins/lfg/bin/lfg --json dry-setup
plugins/lfg/bin/lfg --json doctor
```

## CONVENTIONS

- Keep output focused on `lazycodex-ai` and `npx lazycodex-ai install`.
- Keep npm/npx as the project toolchain; do not add Bun scripts or runtime dependencies.
- Do not describe this repository as a plugin or runtime.
- Do not add unrelated runtime or workflow features.
- Do not mutate `~/.grok` from `doctor` or `dry-setup`.
- Only mutate through an explicit `setup --run` surface.
- Never print API keys in JSON output or final logs.
- Keep CLI, package metadata, and skill copy consistent about the single installer command.

## ANTI-PATTERNS

- Reintroducing broad runtime surfaces.
- Adding another installer path that bypasses `npx lazycodex-ai install`.
- Letting `dry-setup` or `doctor` silently write into `~/.grok`; only explicit setup commands may do that.
- Expanding `doctor` or `dry-setup` into unrelated environment management.

## NOTES

- The worktree may contain deleted legacy files from a larger previous product shape; do not revive them without an explicit request.
- Current deterministic tests are under `plugins/lfg/bin`.
