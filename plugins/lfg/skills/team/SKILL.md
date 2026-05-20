---
name: team
description: "Create and manage durable OMO-style agent teams with tmux-backed local observability."
user_invocable: true
---

# Team — OMO Team Mode

Create and manage parallel agent teams for complex implementation tasks. Team Mode combines OMO mailbox/tasklist semantics with local tmux observability and canonical Grok sub-agent fallback envelopes; native Grok child execution remains manual-gated until T28 evidence passes.

## Usage

```text
/team 3:executor "fix the failing tests"
/team status <team-name>
/team resume <team-name>
/team shutdown <team-name>
```

## Behavior

- **Multi-Provider Swarm**: Launch teams using manual-gated Grok fallback lanes (`grok` provider) or external coding CLIs (`claude`, `codex`, `copilot`, etc.).
- **Mailbox & Tasklist**: Workers communicate through a shared mailbox and execute tasks from a common tasklist.
- **Tmux Visibility**: Local execution is backed by tmux, allowing you to observe worker progress in real-time.
- **Hyperplan Integration**: Teams can be created as part of a Hyperplan adversarial planning session.

## Runtime

Backed by `lfg team`, MCP `team`, and the Team Mode runtime.
