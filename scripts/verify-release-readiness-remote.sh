#!/usr/bin/env bash
set -euo pipefail
BRANCH="${1:-p1}"
TAG="${2:-grok-build-v0.3.0-p1}"
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
scripts/verify-remote-smoke.sh "$BRANCH" >/tmp/grok-build-release-remote-smoke.out
scripts/verify-release-tag.sh --remote "$TAG" >/tmp/grok-build-release-remote-tag.out
python3 - <<'PY'
import pathlib
remote = pathlib.Path('/tmp/grok-build-release-remote-smoke.out').read_text()
tag = pathlib.Path('/tmp/grok-build-release-remote-tag.out').read_text()
assert 'remote-smoke=ok' in remote, remote
assert 'release-tag-remote=ok' in tag, tag
assert 'release-tag-policy=ok' in tag, tag
print('release-readiness-remote=ok')
PY
