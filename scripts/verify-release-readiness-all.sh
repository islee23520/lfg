#!/usr/bin/env bash
set -euo pipefail
BRANCH="${1:-p1}"
TAG="${2:-grok-build-v0.3.0-p1}"
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
scripts/verify-release-readiness-local.sh >/tmp/grok-build-release-readiness-local.out
scripts/verify-release-readiness-remote.sh "$BRANCH" "$TAG" >/tmp/grok-build-release-readiness-remote.out
python3 - <<'PY'
import pathlib
local = pathlib.Path('/tmp/grok-build-release-readiness-local.out').read_text()
remote = pathlib.Path('/tmp/grok-build-release-readiness-remote.out').read_text()
assert 'release-readiness-local=ok' in local, local[-2000:]
assert 'release-readiness-remote=ok' in remote, remote[-2000:]
print('release-readiness-all=ok')
PY
