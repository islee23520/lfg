# Hook evidence

This plugin bundles a fail-open passive audit hook at:

```text
plugins/grok-harnessing/hooks/hooks.json
plugins/grok-harnessing/hooks/scripts/grok-build-audit-hook.sh
```

Grok hook docs recommend command paths relative to the hook JSON file, so the plugin uses:

```text
scripts/grok-build-audit-hook.sh
```

## Evidence gates

Run:

```sh
scripts/verify-grok-hook-discovery.sh
```

Expected evidence:

```text
grok-hook-discovery=ok
hook-event-replay=ok
grok-headless-session=ok
```

The gate verifies:

1. real `~/.grok/bin/grok inspect --json` discovers the installed plugin hook file,
2. the installed hook command is relative and portable,
3. replaying a Grok-style hook event writes `audit.jsonl`,
4. secret-looking tokens are redacted,
5. a real Grok headless session can run while the plugin is installed.

Current note: on this local Grok `0.1.211`, headless `grok -p` sessions complete successfully but do not emit plugin hook audit records by themselves. The replay gate therefore remains the deterministic event evidence until the TUI/modal hook execution path is verified interactively.
