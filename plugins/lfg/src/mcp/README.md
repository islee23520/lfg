# MCP module boundary

`bin/lfg-mcp.ts` is the routing-only stdio entrypoint. `server.ts` owns the dependency-free JSON-RPC adapter and must stay stdout-clean.

Static MCP schema/catalog data lives here so MCP tool definitions can evolve independently from protocol handling. Keep translated OMO behavior in TypeScript runtime modules, not in prompt text or duplicated JSON-RPC dispatch logic.

Tool names in `tools.json` are canonical short names; `tools.ts` is only the loader. `server.ts` still accepts legacy `grok_build_*` calls as compatibility aliases, but `tools/list` should expose the short names only.
