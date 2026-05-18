# linalab-io/lfg

**OMX-like workflow/plugins for LFG.**

`lfg` aims to bring to **LFG** what [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) brings to **Codex**: workflow skills, plugin packaging, hooks, MCP tools, durable state, diagnostics, QA loops, and agent/team-style execution patterns.

This repo is the LFG adaptation. It is plugin-first: the plugin is installed through Grok's plugin/marketplace flow, then Grok discovers its skills, hooks, MCP server, and runtime helpers.

## Product scope

The target scope is simple:

> Implement an oh-my-codex-style workflow/plugin layer for LFG.

That means Grok-native equivalents for the OMX-style surface:

- workflow skills: `plan`, `ralph`, `ultraqa`, `ultragoal`, `ultrawork`, `pipeline`, `team`, `worker`
- repo/product support: `analyze`, `code-review`, `design`, `wiki`, `doctor`, `hud`
- setup/ops: `omx-setup`, `configure-notifications`, `cancel`, `skill`
- runtime services: hooks, MCP tools, plugin data, state files, smoke tests
- marketplace install path: add LinaLab's marketplace in Grok, then install `lfg`

## Install through Grok marketplace

The intended install path is inside Grok:

1. Open LFG.
2. Open the extensions modal with `/plugins`.
3. Add the LinaLab marketplace source URL:

   ```text
   https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json
   ```
4. Install/add `lfg` from that marketplace.
5. Enable the plugin.
6. Verify it shows skills, hooks, and MCP server entries.

Marketplace/package identity:

```text
Marketplace: linalab-io
Package:     linalab-io/lfg
Plugin id:   lfg
Repository:  https://github.com/islee23520/lfg
Marketplace source repo: https://github.com/islee23520/lfg.git
Reference:   https://github.com/Yeachan-Heo/oh-my-codex
```

Marketplace source file:

```text
.grok/plugins/marketplace.json
.agents/plugins/marketplace.json
```

Developer smoke commands live in [`docs/SMOKE.md`](docs/SMOKE.md); the primary install path is the Grok `/plugins` marketplace flow above.

## Use

After installation, features are invoked as Grok slash commands. Grok should discover commands including:

```text
/plan
/ralph
/ultraqa
/ultragoal
/ultrawork
/pipeline
/team
/worker
/wiki
/doctor
/hud
/lfg
```

The `/team` slash command is backed by the same parser exposed through MCP tool `grok_build_slash`. The MVP runtime can also be exercised directly during development:

```sh
plugins/lfg/bin/lfg.py status
plugins/lfg/bin/lfg.py catalog
plugins/lfg/bin/lfg.py doctor
plugins/lfg/bin/lfg.py hud --text
plugins/lfg/bin/lfg.py omx-setup check
plugins/lfg/bin/lfg.py omx-setup install-plan --marketplace linalab-io/lfg
plugins/lfg/bin/lfg.py skill search ultraqa
plugins/lfg/bin/lfg.py pipeline create "ship feature" --stages "plan;build;verify"
plugins/lfg/bin/lfg.py autopilot create "ship strict loop"
plugins/lfg/bin/lfg.py autopilot advance --phase 1 --status complete --evidence "plan ok"
plugins/lfg/bin/lfg.py performance-goal create "reduce latency" --metrics "latency"
plugins/lfg/bin/lfg.py performance-goal measure --metric latency --baseline 120 --current 80 --target 100 --evidence "bench ok"
plugins/lfg/bin/lfg.py visual-ralph create "http://localhost:3000" --reference design.png --threshold 0.9
plugins/lfg/bin/lfg.py visual-ralph verdict --score 0.91 --status pass --evidence "pixel diff ok"
plugins/lfg/bin/lfg.py code-review create "review current changes"
plugins/lfg/bin/lfg.py analyze create --focus "plugin surface"
plugins/lfg/bin/lfg.py ask create "review this architecture" --provider codex --dry-run
plugins/lfg/bin/lfg.py configure-notifications set --channel console --target stdout --enabled
plugins/lfg/bin/lfg.py design add "Team backend" "Use tmux windows" --rationale "durable coordination"
plugins/lfg/bin/lfg.py deep-interview create "team mode requirements"
plugins/lfg/bin/lfg.py autoresearch create "How should team mode work?"
plugins/lfg/bin/lfg.py autoresearch-goal create "What is safest?" --hypotheses "A;B"
plugins/lfg/bin/lfg.py autoresearch-goal critique --verdict pass --critic professor --evidence "sources verified"
plugins/lfg/bin/lfg.py ai-slop-cleaner create --scope README.md --verification self-test
plugins/lfg/bin/lfg.py worker ack worker-1 "fix tests"
plugins/lfg/bin/lfg.py ralph create "iterate until tests pass" --max-iterations 3
plugins/lfg/bin/lfg.py ultrawork create "ship batch" --tasks "one;two"
plugins/lfg/bin/lfg.py ultrawork update --task 1 --status complete --evidence "verified"
plugins/lfg/bin/lfg.py wiki add "Decision" "Use tmux backend" --tags team
plugins/lfg/bin/lfg.py wiki search tmux
plugins/lfg/bin/lfg.py ralplan create "Consensus plan" --steps "design;verify"
plugins/lfg/bin/lfg.py ralplan review --verdict approve --reviewer architect --evidence "looks safe"
plugins/lfg/bin/lfg.py plan create "ship lfg MVP"
plugins/lfg/bin/lfg.py goal create "ship durable goal" --checklist "design;test;verify"
plugins/lfg/bin/lfg.py cancel --scope goal,plan
plugins/lfg/bin/lfg.py ultraqa "verify plugin install and MCP smoke" --no-run
plugins/lfg/bin/lfg slash '/team 3:executor "fix tests"' --dry-run
```

Runtime state is stored under:

```text
.lfg/
```

## LFG tmux backend / team mode

The main power feature is durable team execution. `/team` is the Grok-facing command, and `lfg` is the tmux backend runtime. It can launch a mixed worker team across Hermes, Claude Code, and Codex.

Example target flow inside Grok:

```text
/team providers
/team preflight
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

Equivalent local runtime commands:

```sh
plugins/lfg/bin/lfg backend start
plugins/lfg/bin/lfg team providers
plugins/lfg/bin/lfg team preflight
plugins/lfg/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/lfg/bin/lfg team status <team-name>
plugins/lfg/bin/lfg team resume <team-name>
plugins/lfg/bin/lfg team shutdown <team-name>
```

Before starting a real team, run `/team preflight` or `lfg team preflight`. It checks tmux/backend readiness, lists provider availability, and returns actionable next commands including provider listing, backend attach/status, and a noop smoke team command.

Default team providers rotate through:

```text
hermes -z ... chat
claude --permission-mode bypassPermissions ...
codex ...
```

The smoke-safe provider is:

```text
noop
```

## `lfg` is the default binary

`lfg` is the **official, default CLI binary** for lfg / the LFG runtime.

- `lfg` (no args from a terminal) → starts the durable tmux backend and attaches
- `lfg status`, `lfg doctor`, `lfg ultragoal spawn 3:executor "..."`, `lfg team create ...` etc.
- `ulw` is the specialized launcher for ultragoal-driven swarms (sets `LFG_LAUNCHER=ulw`)

Install the symlinks (recommended):

```sh
scripts/install-lfg-symlink.sh
```

This places `lfg` and `ulw` (plus the internal `lfg.py` for reference) under `~/.grok/bin/` and `~/.local/bin/`, then runs the smoke verification that `lfg` reports the correct launcher identity.

After this, `lfg` on your PATH is the wrapped LFG experience.

## Verify

Run the plugin self-test:

```sh
plugins/lfg/bin/self-test.sh
```

Run a real local Grok install/discovery smoke when `~/.grok/bin/grok` is available:

```sh
plugins/lfg/bin/grok-install-smoke.sh
```

Run the full local+remote release-readiness gate after pushing `p1` and updating the preview tag:

```sh
scripts/verify-release-readiness-all.sh p1 lfg-v0.3.0-p1
```

Expected evidence:

```text
release-readiness-all=ok
```

Expected Grok discovery signal after install:

```text
lfg v0.3.0
  28 skills, hooks: active, 1 MCP servers
```

The self-test checks manifests, required files, hook smoke, token-like redaction, MCP initialization, MCP tool listing, installed `lfg` symlink entrypoints, team preflight/provider gates, and the runtime smoke matrix.

Runtime smoke coverage tracks the implemented OMX-like feature matrices under `plugins/lfg/docs/features/`; all matrix rows must pass for `runtime-smoke-coverage=100%`.

See [`docs/SMOKE.md`](docs/SMOKE.md) for the complete local, real-Grok, and GitHub Actions smoke procedure.
See [`docs/RELEASE_CHECKLIST.md`](docs/RELEASE_CHECKLIST.md) for the release gate checklist.

## Layout

```text
.grok/plugins/marketplace.json           # local Grok marketplace metadata
.agents/plugins/marketplace.json         # Agents-compatible marketplace metadata
plugins/lfg/
  .grok-plugin/plugin.json               # Grok plugin manifest
  .claude-plugin/plugin.json             # compatibility manifest
  .mcp.json                              # MCP server config
  .lsp.json                              # LSP placeholder
  agents/harness.toml
  bin/lfg.py                      # OMX-like MVP runtime
  bin/lfg                                # tmux backend wrapper
  bin/ulw                                # short alias for the same backend
  bin/lfg-mcp.py                  # stdio JSON-RPC MCP server
  bin/self-test.sh                       # local smoke test
  catalog/omx-skill-map.json             # oh-my-codex to Grok skill map
  docs/omx-feature-map.md                # design map from OMX to Grok
  hooks/hooks.json
  hooks/scripts/lfg-audit-hook.sh
  skills/*/SKILL.md                      # Grok skill surface
```

## Attribution

Built with [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) as the public reference for the workflow/plugin model. `lfg` is a separate LFG plugin implementation that adapts those ideas to Grok's marketplace, skills, hooks, MCP, and plugin-data conventions.
