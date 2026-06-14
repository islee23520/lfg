# lfg OMO Grok Adapter Plan

Canonical ULW execution plan for the Grok-first lfg adapter.

## Scope

- Keep `runGrokInstall` as the single install transaction for materializing the internal Grok payload.
- Keep `lfgIsPlugin: false`; lfg is the setup helper/adapter package, not the Grok plugin runtime.
- Preserve Grok-first setup behavior under `~/.grok` without default Codex installation.
