# linalab-io-framework/grok-build

**OMX-like workflow/plugins for Grok Build.**

`grok-build` aims to bring to **Grok Build** what [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) brings to **Codex**: workflow skills, plugin packaging, hooks, MCP tools, durable state, diagnostics, QA loops, and agent/team-style execution patterns.

This repo is the Grok Build adaptation. It is plugin-first: the plugin is installed through Grok's plugin/marketplace flow, then Grok discovers its skills, hooks, MCP server, and runtime helpers.

## Product scope

The target scope is simple:

> Implement an oh-my-codex-style workflow/plugin layer for Grok Build.

That means Grok-native equivalents for the OMX-style surface:

- workflow skills: `plan`, `ralph`, `ultraqa`, `ultragoal`, `ultrawork`, `pipeline`, `team`, `worker`
- repo/product support: `analyze`, `code-review`, `design`, `wiki`, `doctor`, `hud`
- setup/ops: `omx-setup`, `configure-notifications`, `cancel`, `skill`
- runtime services: hooks, MCP tools, plugin data, state files, smoke tests
- marketplace install path: add LinaLab's marketplace in Grok, then install `grok-build`

## Install through Grok marketplace

The intended install path is inside Grok:

1. Open Grok Build.
2. Open the extensions modal with `/plugins`.
3. Add the LinaLab marketplace source URL:

   ```text
   https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json
   ```
4. Install/add `grok-build` from that marketplace.
5. Enable the plugin.
6. Verify it shows skills, hooks, and MCP server entries.

Marketplace/package identity:

```text
Marketplace: linalab-io-framework
Package:     linalab-io-framework/grok-build
Plugin id:   grok-build
Repository:  https://github.com/islee23520/lfg
Reference:   https://github.com/Yeachan-Heo/oh-my-codex
```

Marketplace source file:

```text
.grok/plugins/marketplace.json
.agents/plugins/marketplace.json
```

A developer can also install the plugin directly for smoke testing:

```sh
git clone https://github.com/islee23520/lfg.git
cd lfg
mkdir -p ~/.grok/plugins
cp -R plugins/grok-harnessing ~/.grok/plugins/grok-build
grok -p "/plugins enable grok-build" --cwd "$PWD" --max-turns 8 --output-format json
```

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
/grok-harnessing
```

The `/team` slash command is backed by the same parser exposed through MCP tool `grok_build_slash`. The MVP runtime can also be exercised directly during development:

```sh
plugins/grok-harnessing/bin/grok-build.py status
plugins/grok-harnessing/bin/grok-build.py catalog
plugins/grok-harnessing/bin/grok-build.py doctor
plugins/grok-harnessing/bin/grok-build.py hud --text
plugins/grok-harnessing/bin/grok-build.py skill search ultraqa
plugins/grok-harnessing/bin/grok-build.py pipeline create "ship feature" --stages "plan;build;verify"
plugins/grok-harnessing/bin/grok-build.py autopilot create "ship strict loop"
plugins/grok-harnessing/bin/grok-build.py autopilot advance --phase 1 --status complete --evidence "plan ok"
plugins/grok-harnessing/bin/grok-build.py performance-goal create "reduce latency" --metrics "latency"
plugins/grok-harnessing/bin/grok-build.py performance-goal measure --metric latency --baseline 120 --current 80 --target 100 --evidence "bench ok"
plugins/grok-harnessing/bin/grok-build.py visual-ralph create "http://localhost:3000" --reference design.png --threshold 0.9
plugins/grok-harnessing/bin/grok-build.py visual-ralph verdict --score 0.91 --status pass --evidence "pixel diff ok"
plugins/grok-harnessing/bin/grok-build.py code-review create "review current changes"
plugins/grok-harnessing/bin/grok-build.py analyze create --focus "plugin surface"
plugins/grok-harnessing/bin/grok-build.py ask create "review this architecture" --provider codex --dry-run
plugins/grok-harnessing/bin/grok-build.py configure-notifications set --channel console --target stdout --enabled
plugins/grok-harnessing/bin/grok-build.py design add "Team backend" "Use tmux windows" --rationale "durable coordination"
plugins/grok-harnessing/bin/grok-build.py deep-interview create "team mode requirements"
plugins/grok-harnessing/bin/grok-build.py autoresearch create "How should team mode work?"
plugins/grok-harnessing/bin/grok-build.py ai-slop-cleaner create --scope README.md --verification self-test
plugins/grok-harnessing/bin/grok-build.py worker ack worker-1 "fix tests"
plugins/grok-harnessing/bin/grok-build.py ralph create "iterate until tests pass" --max-iterations 3
plugins/grok-harnessing/bin/grok-build.py ultrawork create "ship batch" --tasks "one;two"
plugins/grok-harnessing/bin/grok-build.py ultrawork update --task 1 --status complete --evidence "verified"
plugins/grok-harnessing/bin/grok-build.py wiki add "Decision" "Use tmux backend" --tags team
plugins/grok-harnessing/bin/grok-build.py wiki search tmux
plugins/grok-harnessing/bin/grok-build.py plan create "ship grok-build MVP"
plugins/grok-harnessing/bin/grok-build.py goal create "ship durable goal" --checklist "design;test;verify"
plugins/grok-harnessing/bin/grok-build.py cancel --scope goal,plan
plugins/grok-harnessing/bin/grok-build.py ultraqa "verify plugin install and MCP smoke" --no-run
plugins/grok-harnessing/bin/lfg slash '/team 3:executor "fix tests"' --dry-run
```

Runtime state is stored under:

```text
~/.grok/plugin-data/grok-build/
```

## LFG tmux backend / team mode

The main power feature is durable team execution. `/team` is the Grok-facing command, and `lfg` is the tmux backend runtime. It can launch a mixed worker team across Hermes, Claude Code, and Codex.

Example target flow inside Grok:

```text
/team 3:executor "fix the failing tests with verification"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

Equivalent local runtime commands:

```sh
plugins/grok-harnessing/bin/lfg backend start
plugins/grok-harnessing/bin/lfg team create 3:executor "fix the failing tests with verification"
plugins/grok-harnessing/bin/lfg team status <team-name>
plugins/grok-harnessing/bin/lfg team resume <team-name>
plugins/grok-harnessing/bin/lfg team shutdown <team-name>
```

Default team providers rotate through:

```text
hermes -z ... chat
claude --permission-mode bypassPermissions ...
codex ...
```

## Verify

Run the plugin self-test:

```sh
plugins/grok-harnessing/bin/self-test.sh
```

Expected Grok discovery signal after install:

```text
grok-build v0.3.0
  28 skills, hooks: active, 1 MCP servers
```

The self-test checks manifests, required files, hook smoke, token-like redaction, MCP initialization, MCP tool listing, and the runtime smoke matrix.

Runtime smoke coverage tracks the implemented OMX-like feature matrices under `plugins/grok-harnessing/docs/features/`; all matrix rows must pass for `runtime-smoke-coverage=100%`.

## Layout

```text
.grok/plugins/marketplace.json           # local Grok marketplace metadata
.agents/plugins/marketplace.json         # Agents-compatible marketplace metadata
plugins/grok-harnessing/
  .grok-plugin/plugin.json               # Grok plugin manifest
  .claude-plugin/plugin.json             # compatibility manifest
  .mcp.json                              # MCP server config
  .lsp.json                              # LSP placeholder
  agents/harness.toml
  bin/grok-build.py                      # OMX-like MVP runtime
  bin/lfg                                # tmux backend wrapper
  bin/grok-build-mcp.py                  # stdio JSON-RPC MCP server
  bin/self-test.sh                       # local smoke test
  catalog/omx-skill-map.json             # oh-my-codex to Grok skill map
  docs/omx-feature-map.md                # design map from OMX to Grok
  hooks/hooks.json
  hooks/scripts/grok-build-audit-hook.sh
  skills/*/SKILL.md                      # Grok skill surface
```

## Attribution

Built with [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) as the public reference for the workflow/plugin model. `grok-build` is a separate Grok Build plugin implementation that adapts those ideas to Grok's marketplace, skills, hooks, MCP, and plugin-data conventions.
