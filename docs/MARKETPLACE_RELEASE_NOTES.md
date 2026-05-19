# Marketplace release notes

## lfg 0.3.0 — p1 hardening preview

Preview release tag: `lfg-v0.3.0-p1`

Package: `islee23520/lfg`
Marketplace source: `https://github.com/islee23520/lfg.git`
Stable marketplace URL: `https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json`
Preview marketplace URL: `https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json`
Plugin path: `plugins/lfg`
Reference model: [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)

### What ships

- OMO-native LFG skill surface: `hyperplan`, `team-mode`, `review-work`, `git-master`, browser automation skills, release workflow skills, and the local `lfg` validation skill.
- `/team` slash flow backed by explicit `lfg` team lifecycle commands.
- Mixed provider planning for Hermes, Claude Code, and Codex worker teams.
- Real Grok install/discovery smoke against `~/.grok/bin/grok inspect --json`.
- MCP tools for runtime, team, slash, and workflow state surfaces.
- Hook redaction smoke and fail-open audit hook behavior.
- State schema versioning with `state/schema.json` at schema version `1`.

### Required release evidence

A release candidate must pass the following evidence gates before tagging or merging:

```text
runtime-smoke-coverage=100%
grok-install-smoke=ok skills=17 key_skills_present
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

Until the hosted marketplace source is finalized, local development can still sync the plugin into `~/.grok/plugins/lfg` with:

```sh
plugins/lfg/bin/grok-install-smoke.sh
```
