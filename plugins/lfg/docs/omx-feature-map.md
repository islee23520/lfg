# OMX → LFG Feature Map

Source: <https://github.com/Yeachan-Heo/oh-my-codex>

This plugin ports the **plugin-bundle feature surface** of oh-my-codex into LFG. It intentionally maps behaviors to Grok-native skills, plugin hooks, MCP servers, and `.lfg/` state rather than requiring Codex-specific goal mode or OMX tmux runtime.

## Mapping strategy

| OMX surface | LFG adaptation |
| --- | --- |
| `plugins/oh-my-codex/skills/*/SKILL.md` | `plugins/lfg/skills/*/SKILL.md` with same skill names and Grok-native execution rules |
| `.codex-plugin/plugin.json` | `.grok-plugin/plugin.json` plus `.claude-plugin/plugin.json` compatibility |
| `.mcp.json` | `.mcp.json` using `bin/lfg-mcp.py` |
| OMX state CLI/MCP | `.lfg/` files plus MCP catalog/status tools |
| Codex goal workflows | Grok checklist + durable state + verification gates |
| OMX hook lifecycle | Grok `hooks/hooks.json` fail-open audit hook |
| OMX team/tmux orchestration | Grok subagents/sessions where available; otherwise explicit checklist handoff |

## Ported skill surface

See `catalog/omx-skill-map.json` for the generated 1:1 skill-name map and source commit.

## Non-goals

- This plugin does not vendor the OMX TypeScript/Rust runtime.
- This plugin does not execute hidden `omx` shell commands unless a user explicitly asks for OMX interop.
- This plugin does not copy upstream skill bodies verbatim; it ports the workflow identity and Grok execution contract.
