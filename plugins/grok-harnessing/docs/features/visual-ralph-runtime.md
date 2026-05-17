# Feature: `/visual-ralph` visual loop state

## Goal

Provide an OMX-like visual Ralph entrypoint for Grok Build that tracks UI target/reference matching iterations and visual verdict evidence durably.

## User contract

```text
/visual-ralph create "http://localhost:3000" --reference design.png --threshold 0.9
/visual-ralph verdict --score 0.91 --status pass --evidence "pixel diff ok"
/visual-ralph show
```

## Runtime contract

- Runtime command: `bin/lfg visual-ralph create/verdict/show`
- MCP tool: `grok_build_visual_ralph`
- State path: `~/.grok/plugin-data/grok-build/runs/visual-ralph/*.json`
- Current pointer: `~/.grok/plugin-data/grok-build/state/current-visual-ralph.json`
- Verdict status: `pass`, `fail`, or `blocked`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| visual-ralph create/verdict/show persists visual verdict state | `test_visual_ralph_create_verdict_show` |
| MCP visual-ralph tool records visual verdict progress | `test_mcp_visual_ralph_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
