# Feature: `/skill` catalog list/search

## Goal

Provide an OMX-like skill management entrypoint for LFG that can list and search the ported workflow skill surface.

## User contract

```text
/skill list
/skill search ultraqa
```

## Runtime contract

- Runtime command: `bin/lfg skill list/search`
- MCP tool: `grok_build_skill`
- MCP runtime query: `grok_build_runtime` with `skill_list` or `skill_search`
- Source data: `catalog/omo-skill-map.json`

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| skill list/search reads the 28-skill catalog | `test_skill_list_search_catalog` |
| MCP skill tool lists/searches catalog | `test_mcp_skill_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
