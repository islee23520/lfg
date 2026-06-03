# PROJECT KNOWLEDGE BASE

## OVERVIEW

`lfg` is a Bun/TypeScript adapter installer around:

```sh
npx lazycodex-ai install
```

It is not a plugin. It does not own a Grok or lazycodex runtime. Its job is to install or locate the `lazycodex` Codex adapter under `~/.grok` and optionally help users configure a Grok OpenAI-compatible BYOK model so `grok-build` can use lazycodex without a separate Grok session path.

## STRUCTURE

- `plugins/lfg/bin/lfg.ts`: CLI entrypoint for status, doctor, Grok BYOK config, lazycodex install/status, and setup plan commands.
- `plugins/lfg/bin/lfg-config.ts`: explicit `~/.grok/config.toml` BYOK config helper.
- `plugins/lfg/bin/lfg-mcp.ts`: MCP entrypoint around the same command contracts.
- `plugins/lfg/skills/lazycodex/SKILL.md`: skill that points users to the npm installer and adapter root.
- `tests/AGENTS.md`: test-scope rules.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change CLI output or routing | `plugins/lfg/bin/lfg.ts` | Keep the command set narrow. |
| Change MCP behavior | `plugins/lfg/bin/lfg-mcp.ts` | Must mirror the CLI installer contracts. |
| Change installer wording | `plugins/lfg/bin/lfg.ts` | Source of package and command metadata. |
| Change Grok BYOK config behavior | `plugins/lfg/bin/lfg-config.ts` | Keep mutations explicit and never print API keys. |
| Change setup-plan behavior | `plugins/lfg/bin/lfg.ts` | Do not hide global mutations here. |
| Change user-facing skill copy | `plugins/lfg/skills/lazycodex/SKILL.md` | Keep it about installing the lazycodex adapter. |

## CODE MAP

| Surface | Location | Role |
|---------|----------|------|
| `lfg install` | `plugins/lfg/bin/lfg.ts` | Human-facing interactive installer for `npx lazycodex-ai install`. |
| `lfg config grok-byok` | `plugins/lfg/bin/lfg.ts` | Explicit helper for planning or writing Grok OpenAI-compatible BYOK config. |
| `lfg --json install` | `plugins/lfg/bin/lfg.ts` | Emits the install plan for `npx lazycodex-ai install`. |
| `lfg --json lazycodex install` | `plugins/lfg/bin/lfg.ts` | Compatibility alias for the install plan. |
| `lfg --json lazycodex status` | `plugins/lfg/bin/lfg.ts` | Reports readiness and the primary installer command. |
| `lfg-mcp` | `plugins/lfg/bin/lfg-mcp.ts` | Exposes minimal MCP tools around the same behavior. |
| `lazycodex` skill | `plugins/lfg/skills/lazycodex/SKILL.md` | Tells users how to run the npm installer and where grok-build should find the adapter. |

## COMMANDS

```sh
bun test plugins/lfg/bin
bun plugins/lfg/bin/self-test.ts
bun run typecheck
plugins/lfg/bin/lfg --json lazycodex install
plugins/lfg/bin/lfg --json install
plugins/lfg/bin/lfg --json config grok-byok
plugins/lfg/bin/lfg --json lazycodex status
```

## CONVENTIONS

- Keep output focused on `lazycodex-ai` and `npx lazycodex-ai install`.
- Do not describe this repository as a plugin or runtime.
- Do not add unrelated runtime or workflow features.
- Do not mutate `~/.grok` from status, doctor, or setup-plan commands.
- Only mutate `~/.grok/config.toml` from an explicit Grok BYOK config surface such as confirmed `lfg install` prompts or `lfg config grok-byok --run`.
- Never print API keys in JSON output or final logs.
- Keep CLI, MCP, package metadata, and skill copy consistent about the single installer command.

## ANTI-PATTERNS

- Reintroducing broad runtime surfaces.
- Adding another installer path that bypasses `npx lazycodex-ai install`.
- Letting setup or status commands silently write into `~/.grok`; only explicit installer or BYOK config commands may do that.
- Expanding doctor/status into unrelated environment management.

## NOTES

- The worktree may contain deleted legacy files from a larger previous product shape; do not revive them without an explicit request.
- Current deterministic tests are under `plugins/lfg/bin`.
