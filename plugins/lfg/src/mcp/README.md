# MCP module boundary

`bin/lfg-mcp.py` is the routing-only stdio entrypoint. `server.py` owns the dependency-free JSON-RPC adapter and must stay stdout-clean.

Static MCP schema/catalog data lives here so MCP tool definitions can evolve independently from protocol handling. Keep translated OMO behavior in Python runtime modules, not in prompt text or duplicated JSON-RPC dispatch logic.

Tool names in `tools.json` are canonical short names; `tools.py` is only the loader. `server.py` still accepts legacy `grok_build_*` calls as compatibility aliases, but `tools/list` should expose the short names only.
