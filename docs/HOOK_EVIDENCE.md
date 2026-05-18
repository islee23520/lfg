# Hook evidence

This plugin bundles a fail-open passive audit hook at:

```text
plugins/lfg/hooks/hooks.json
plugins/lfg/hooks/scripts/lfg-audit-hook.sh
```

Grok hook docs recommend command paths relative to the hook JSON file, so the plugin uses:

```text
scripts/lfg-audit-hook.sh
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


## Headless real-session limitation check

Run:

```sh
scripts/verify-grok-hook-headless-limitation.sh
```

Observed on local Grok `0.1.211`:

```text
grok-real-tool-session=ok
grok-headless-hook-emission=not-observed grok=0.1.211
```

This proves a real Grok headless session can execute a terminal tool while the plugin is installed, but plugin hook audit records are not emitted by headless mode in this version. Keep the ROADMAP item open until an interactive TUI/modal run produces `grok-headless-hook-emission=ok` or Grok exposes a stable hook-test command.


## Headless `/hooks-list` limitation check

Run:

```sh
scripts/verify-grok-hooks-slash-limitation.sh
```

Observed on local Grok `0.1.211`:

```text
grok-hooks-list-headless=not-observed reason=max_turns-exceeded
```

This confirms that the headless slash surface for `/hooks-list` is not a stable hook evidence source in this version; it can recurse into filesystem inspection and exceed `max_turns`. Use `grok inspect --json`, `/plugins list`, and hook replay gates for deterministic automation until Grok exposes a hook-test command or the interactive TUI/modal path is manually verified.


## TUI PTY hook limitation check

Run:

```sh
scripts/verify-grok-tui-hook-limitation.sh
```

Observed on local Grok `0.1.211` via `/usr/bin/expect` PTY automation:

```text
grok-tui-hook-session=attempted
grok-tui-hook-emission=not-observed grok=0.1.211
```

This starts real `grok --no-leader --no-alt-screen` in a PTY, submits a prompt that reaches terminal-tool execution (`echo LFG_TUI_HOOK_SESSION`), then checks the plugin audit log. No audit log is emitted in this automated TUI path either.


## Global-vs-plugin hook scope check

Run:

```sh
scripts/verify-grok-plugin-hook-scope-limitation.sh
```

Observed on local Grok `0.1.211`:

```text
grok-global-hook-engine=ok events=5
grok-plugin-hook-scope=not-observed while-global-hooks-ok
```

This proves Grok's hook engine fires for global hooks in the same headless/tool-use path, while plugin hook commands remain non-emitting even when the installed plugin hook command is temporarily changed to an absolute path. The remaining open blocker is therefore narrowed to plugin hook execution scope in Grok `0.1.211`, not the hook script, redaction logic, or generic hook engine.


## Global hook bridge workaround

Because Grok `0.1.211` fires global hooks but does not emit plugin hook audit records in the tested paths, `lfg` includes an optional bridge installer:

```sh
scripts/install-lfg-global-hook-bridge.sh
```

Verify it with:

```sh
scripts/verify-lfg-global-hook-bridge.sh
```

Expected evidence:

```text
lfg-global-hook-bridge=installed
grok-global-hook-bridge=ok
```

This installs a global `~/.grok/hooks/lfg-audit-bridge.json` that delegates to the installed plugin audit hook at `~/.grok/plugins/lfg/hooks/scripts/lfg-audit-hook.sh`. The verification runs a real Grok tool-use session and confirms `.lfg/events/audit.jsonl` is written.

Runtime CLI support:

```sh
lfg hook-bridge status
lfg hook-bridge install
lfg slash '/hook-bridge status'
lfg doctor
```

`doctor` reports `global_hook_bridge` as an optional check: absent is OK, installed+valid is OK, and an installed-but-invalid bridge becomes visible evidence without blocking core plugin startup. MCP exposes the same path through `grok_build_runtime(action=hook_bridge_status)` and `grok_build_hook_bridge(action=status|install)`.
