# plugins/lfg

This package is the local adapter-installer and Grok BYOK setup surface for `lazycodex-ai`.

It helps `grok-build` use the `lazycodex` Codex adapter installed under `~/.grok`. It can also explicitly update `~/.grok/config.toml` with a Grok OpenAI-compatible BYOK model. `lfg` is not a plugin and should not be framed as one.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI command surface | `bin/lfg.ts` | Supports primary `install`, plus `status`, `doctor`, `config grok-byok`, compatibility `lazycodex install/status`, and `setup install-plan/show`. |
| Grok BYOK config helper | `bin/lfg-config.ts` | Writes explicit `~/.grok/config.toml` OpenAI-compatible provider config and redacts keys from output. |
| MCP process entry | `bin/lfg-mcp.ts` | Mirrors the CLI command contracts. |
| Package manifest | `package.json` | Bin and package metadata. |
| Skill copy | `skills/lazycodex/SKILL.md` | User-facing lazycodex installer guidance. |

## CONVENTIONS

- Keep the package small and centered on `lazycodex-ai`.
- Use `npx lazycodex-ai install` as the single installer command.
- Keep `lfg install` as the human-facing interactive installer.
- Keep CLI JSON output stable because tests and MCP wrappers consume it.
- Prefer explicit install plans over hidden side effects.
- Only mutate `~/.grok/config.toml` after an explicit BYOK confirmation or `config grok-byok --run`.
- Ask users whether they want CLI proxy, custom OpenAI-compatible provider, or no BYOK config; do not silently hardcode one provider path.
- Keep package descriptions neutral: adapter installer, not plugin/runtime ownership.

## ANTI-PATTERNS

- Calling this package a plugin or runtime.
- Adding unrelated runtime or workflow features.
- Mutating `~/.grok` outside an explicit installer command surface.
- Printing API keys in JSON output, logs, or summaries.
- Duplicating installer metadata across files without updating tests.

## COMMANDS

```sh
bun test plugins/lfg/bin
bun plugins/lfg/bin/self-test.ts
plugins/lfg/bin/lfg --json lazycodex install
plugins/lfg/bin/lfg --json install
plugins/lfg/bin/lfg --json config grok-byok
plugins/lfg/bin/lfg --json lazycodex status
```
