---
name: eval
description: "Persistent code-mode kernels (JS/Python) for incremental computation — omp/senpi eval analog on GrokBuild via lfg MCP. Use when multi-step code execution, data exploration, or stateful REPL beats one-shot bash."
---

# eval (code mode)

Grok-adapted **code mode** inspired by oh-my-pi `eval` and senpi `senpi-codemode`.

Use the **`eval` MCP server** tools (installed by `lfg setup --run`):

| Tool | Purpose |
|---|---|
| `eval` | Run one cell in a persistent kernel (`js` or `py`) |
| `eval_reset` | Wipe kernel state for a language or all |

## When to use eval (not bash)

Prefer **eval** for:

- Multi-step compute (imports → define → test → use)
- Loops, conditionals, dataframes, JSON munging
- Anything where state should survive across steps
- Fragile quoting that bash would mangle

Prefer **bash** only for short single pipelines (`ls`, `git status`, one-shot CLI).

## Discipline (omp parity)

**One eval call = one logical step.**

1. Imports in one call
2. Define helpers/data in the next
3. Test
4. Use

Do **not** re-import / re-declare names already defined unless you `reset`, the kernel crashed, or you got `NameError` / `ReferenceError`.

### Arguments

```json
{
  "language": "js" | "py",
  "code": "<cell body, verbatim>",
  "title": "optional label",
  "timeout": 30,
  "reset": false,
  "cwd": "/optional/workdir"
}
```

- `reset: true` wipes **that language** only before the cell.
- State is per `(cwd, language)` for the life of the MCP process.

### Languages (MVP)

| Token | Runtime |
|---|---|
| `js` | Node VM worker (top-level `await` ok) |
| `py` | `python3` subprocess (`exec` in persistent globals) |

Ruby/Julia kernels exist in omp/senpi but are **not** in this Grok MVP.

## Examples

**Python — incremental**

```text
eval language=py code="import json" title=imports
eval language=py code="data = {\"n\": 3}" title=define
eval language=py code="print(data[\"n\"] * 2)" title=use
```

**JavaScript — top-level await**

```text
eval language=js code="const n = 2" title=define
eval language=js code="n + 40" title=use
```

**Reset after poison state**

```text
eval_reset language=py
```

## Failures

- Kernel timeout → tool returns error; next call starts a fresh kernel for that key.
- Syntax / runtime errors → `ok: false` with traceback; prior names still alive.
- Missing `python3` → py cells fail until available (override with `LFG_EVAL_PYTHON`).

## Out of scope (honesty)

- No `tool.*` / `agent()` / `completion()` bridges (omp full eval has those).
- No rich display / image mime bundles.
- No rb/jl kernels.
- State does not survive Grok process restart (in-process MCP lifetime only).
