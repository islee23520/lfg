#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
plugins/lfg/bin/self-test.sh >/tmp/lfg-release-self-test.out
scripts/verify-team-preflight.sh >/tmp/lfg-release-team-preflight.out
scripts/verify-team-provider-commands.sh >/tmp/lfg-release-team-provider.out
scripts/verify-team-tmux-lifecycle.sh >/tmp/lfg-release-team-tmux.out
scripts/verify-installed-lfg-symlink-surface.sh >/tmp/lfg-release-lfg-installed.out
scripts/verify-grok-installed-mcp-surface.sh >/tmp/lfg-release-mcp-installed.out
python3 - <<'PY'
import pathlib
checks = {
    '/tmp/lfg-release-self-test.out': ['runtime-smoke-coverage=100%'],
    '/tmp/lfg-release-team-preflight.out': ['team-preflight-cli=ok', 'team-preflight-commands=ok', 'team-preflight-slash=ok', 'team-preflight-mcp=ok'],
    '/tmp/lfg-release-team-provider.out': ['team-provider-matrix=ok', 'team-provider-slash=ok', 'team-provider-commands=ok', 'team-provider-doctor=ok'],
    '/tmp/lfg-release-team-tmux.out': ['team-tmux-lifecycle=ok'],
    '/tmp/lfg-release-lfg-installed.out': ['lfg-installed-symlink-surface=ok', 'slash=/team-providers,/team-preflight commands=ok'],
    '/tmp/lfg-release-mcp-installed.out': ['grok-installed-mcp-surface=ok', 'grok_build_team.preflight commands=ok'],
}
for path, needles in checks.items():
    text = pathlib.Path(path).read_text()
    for needle in needles:
        assert needle in text, (path, needle, text[-2000:])
print('release-readiness-local=ok gates=%d' % sum(len(v) for v in checks.values()))
PY
