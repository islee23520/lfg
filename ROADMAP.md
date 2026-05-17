# Roadmap — `linalab-io-frakework/grok-build`

## North star

Build **OMX-like workflow/plugins for Grok Build**.

The product target is: **what [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) does for Codex, `grok-build` should do for Grok Build** — using Grok-native plugin, marketplace, skills, hooks, MCP, and state conventions.

## Installation model

The primary install flow is Grok-native marketplace installation:

1. User opens Grok Build.
2. User opens `/plugins`.
3. User adds the LinaLab marketplace source.
4. User installs/adds `grok-build`.
5. Grok discovers the plugin's skills, hooks, MCP server, and runtime helpers.

Package identity:

```text
Marketplace: linalab-io-frakework
Package:     linalab-io-frakework/grok-build
Plugin id:   grok-build
Repo:        https://github.com/islee23520/lfg
Reference:   https://github.com/Yeachan-Heo/oh-my-codex
```

Local copy/symlink install exists only as a development smoke path until the marketplace source is published and stable.

## Architecture

```text
Grok Build
  └─ Marketplace install: linalab-io-frakework/grok-build
      └─ grok-build plugin
          ├─ skills/*/SKILL.md              # slash workflow entrypoints
          ├─ hooks/hooks.json               # hook registration
          ├─ hooks/scripts/*.sh             # fail-open hook scripts
          ├─ .mcp.json                      # MCP registration
          ├─ bin/grok-build-mcp.py          # stdio MCP server
          ├─ bin/grok-build.py              # MVP workflow runtime
          ├─ catalog/omx-skill-map.json     # oh-my-codex mapping
          └─ ~/.grok/plugin-data/grok-build # durable runtime state
```

## Feature scope

The feature scope is not a tiny demo. The goal is parity with the useful workflow layer exposed by oh-my-codex, adapted to Grok Build.

### Workflow commands

- `plan` / `ralplan` — planning and verification checklist
- `ralph` — bounded execution loop with explicit stop conditions
- `ultragoal` — durable goal state and completion evidence
- `ultraqa` — adversarial QA/smoke/e2e loop
- `ultrawork` — high-throughput task execution pattern
- `pipeline` — staged workflow orchestration
- `team` / `worker` — tmux-backed durable coordination across Hermes, Claude Code, and Codex
- `autoresearch` / `autoresearch-goal` — stateful research workflow
- `performance-goal` — evaluator-gated optimization workflow

### Repo/product commands

- `analyze` — grounded repo analysis
- `code-review` — comprehensive review pass
- `ai-slop-cleaner` — cleanup/deslop workflow
- `design` — design/product source of truth workflow
- `deep-interview` — ambiguity-gated requirement intake
- `visual-ralph` — visual implementation loop where applicable
- `wiki` — durable project notes

### Ops commands

- `doctor` — plugin install/runtime diagnostics
- `hud` — workflow status surface
- `cancel` — cancel/clear active workflow state
- `skill` — manage local skills
- `omx-setup` — setup-equivalent flow for Grok
- `configure-notifications` — notification setup equivalent

### Runtime/services

- Grok plugin manifest
- Grok marketplace metadata
- Claude/Agents compatibility metadata where useful
- Hooks with fail-open behavior and redaction
- MCP tools for catalog/status/runtime entrypoints
- Durable state under `~/.grok/plugin-data/grok-build/`
- Local self-test and Grok discovery smoke tests

## Milestones

### M0 — Plugin package foundation

- [x] Plugin-only repository structure.
- [x] Grok manifest `.grok-plugin/plugin.json`.
- [x] Compatibility manifest `.claude-plugin/plugin.json`.
- [x] Hook registration and fail-open audit hook.
- [x] MCP registration and stdio MCP server.
- [x] Local marketplace metadata.
- [x] Self-test script.

### M1 — oh-my-codex surface map

- [x] Use [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) as the reference.
- [x] Generate `catalog/omx-skill-map.json`.
- [x] Port workflow names into Grok skill folders.
- [x] Confirm Grok lists `28 skills, hooks: active, 1 MCP servers`.

### M2 — MVP runtime

- [x] Add `bin/grok-build.py` runtime.
- [x] Add runtime commands: `status`, `catalog`, `goal`, `plan`, `ultraqa`.
- [x] Store state under `~/.grok/plugin-data/grok-build/`.
- [x] Expose catalog/status via MCP tools.
- [ ] Expose runtime actions via MCP tools.

### M3 — Marketplace-first install

- [ ] Publish/host marketplace metadata so users can add it from Grok `/plugins`.
- [ ] Document exact marketplace source URL.
- [ ] Verify install from Grok UI/TUI marketplace flow.
- [ ] Remove local-dev install from primary docs once marketplace flow is stable.

### M4 — Deep workflow parity

- [ ] Implement Grok-native `plan` behavior.
- [ ] Implement Grok-native `ultragoal` behavior.
- [ ] Implement Grok-native `ultraqa` behavior.
- [x] Implement MVP tmux backend for `team create/status/resume/shutdown`.
- [ ] Wire `/team` arguments directly to the `lfg team` backend.
- [ ] Implement Grok-native `ralph` loop behavior.
- [ ] Implement Grok-native `wiki` storage/search.
- [ ] Implement `doctor` diagnostics.
- [ ] Add behavioral smoke tests per workflow.

### M5 — Hardening

- [ ] Hook event evidence from real Grok sessions.
- [ ] MCP stderr isolation.
- [ ] State migration/versioning.
- [ ] Release tags.
- [ ] Marketplace release notes.

## Team backend design

`/team` is the Grok slash-command surface. `bin/lfg` is the local tmux backend.

Target commands:

```text
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

Backend equivalent:

```sh
plugins/grok-harnessing/bin/lfg backend start
plugins/grok-harnessing/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/grok-harnessing/bin/lfg team status <team-name>
plugins/grok-harnessing/bin/lfg team resume <team-name>
plugins/grok-harnessing/bin/lfg team shutdown <team-name>
```

Default providers are `hermes`, `claude`, and `codex`, launched in tmux windows with durable team state stored under `~/.grok/plugin-data/grok-build/state/teams/`.

## Definition of done

`grok-build` is ready when:

1. A user can add the LinaLab marketplace from Grok `/plugins` and install `grok-build`.
2. Grok discovers the full skill surface, hooks, and MCP server.
3. The core OMX-like workflows run with Grok-native behavior, not only placeholder instructions.
4. Workflow state is durable under `~/.grok/plugin-data/grok-build/`.
5. Self-tests and Grok smoke tests pass.
6. The README explains what the plugin is, how to install it from marketplace, how to run it, and how to verify it.
