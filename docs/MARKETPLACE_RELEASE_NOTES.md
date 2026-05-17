# Marketplace release notes

## grok-build 0.3.0 — p1 hardening preview

Preview release tag: `grok-build-v0.3.0-p1`

Package: `linalab-io-framework/grok-build`
Marketplace source: `https://github.com/islee23520/lfg.git`
Stable marketplace URL: `https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json`
Preview marketplace URL: `https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json`
Plugin path: `plugins/grok-harnessing`
Reference model: [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex)

### What ships

- OMX-like Grok Build workflow skills: `team`, `worker`, `ultrawork`, `ultragoal`, `ultraqa`, `ralph`, `ralplan`, `autopilot`, `pipeline`, `wiki`, `doctor`, and companion workflow surfaces.
- `/team` slash flow backed by the `lfg` tmux backend.
- Mixed provider planning for Hermes, Claude Code, and Codex worker teams.
- Real Grok install/discovery smoke against `~/.grok/bin/grok inspect --json`.
- MCP tools for runtime, team, slash, and workflow state surfaces.
- Hook redaction smoke and fail-open audit hook behavior.
- State schema versioning with `state/schema.json` at schema version `1`.

### Required release evidence

A release candidate must pass the following evidence gates before tagging or merging:

```text
runtime-smoke-coverage=100%
grok-install-smoke=ok skills=28 key_skills_present
lfg-launch-smoke=ok
team-tmux-lifecycle=ok
mcp-stdio-isolation=ok
state-schema-versioning=ok
remote-smoke=ok
```

### Install path

Users should install from Grok's `/plugins` marketplace flow by adding this marketplace source:

```text
https://github.com/islee23520/lfg.git
```

Until the hosted marketplace source is finalized, local development can still sync the plugin into `~/.grok/plugins/grok-build` with:

```sh
plugins/grok-harnessing/bin/grok-install-smoke.sh
```
