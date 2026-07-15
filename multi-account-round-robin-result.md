# Multi-account round-robin result

PASS

- Account metadata is stored in `~/.grok/lfg-accounts.sqlite` with mode `0600`.
- `list`, `add`, `remove`, `use`, `rotate`, `status`, `enable`, and `disable` return redacted JSON only.
- `add --name NAME` imports `~/.grok/auth.json`; `--from-auth PATH` selects another source.
- `use` and `rotate` atomically update Grok host auth and preserve the previous file as `auth.json.bak`.
- Rotation skips disabled accounts and persists its round-robin cursor.
- The native rotation hook is registered once for `UserPromptSubmit` and `SessionStart`.
