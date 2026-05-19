# Feature: `/wiki` durable notes runtime

## Goal

Provide an OMX-like project wiki for LFG: small durable notes, list, and keyword search stored under plugin data.

## User contract

```text
/wiki add "Decision" "Use tmux backend for team mode" --tags team,architecture
/wiki list
/wiki search tmux
```

## Runtime contract

- Runtime command: `bin/lfg wiki add/list/search`
- MCP tool: `grok_build_wiki`
- MCP runtime query: `grok_build_runtime` with `wiki_list` or `wiki_search`
- State path: `.lfg/wiki/*.json`
- Notes store title, body, tags, timestamps, repo context, and path.

## Smoke coverage matrix

| Requirement | Test |
| --- | --- |
| add/list/search persists notes under plugin data | `test_wiki_add_list_search_persists_notes` |
| MCP wiki tool can add and search notes | `test_mcp_wiki_tool` |

Current smoke coverage target: **100% of the matrix above must pass**.
