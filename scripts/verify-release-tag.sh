#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
REMOTE=0
if [[ "${1:-}" == "--remote" ]]; then
  REMOTE=1
  shift
fi
TAG="${1:-lfg-v0.3.0-p1}"
python3 - <<'PY' "$TAG"
import json, pathlib, re, subprocess, sys
root=pathlib.Path('.')
tag=sys.argv[1]
plugin=json.loads((root/'plugins/lfg/.grok-plugin/plugin.json').read_text())
version=plugin['version']
package=plugin['metadata']['packageName']
assert package == 'linalab-io/lfg', package
assert tag in {f'lfg-v{version}', f'lfg-v{version}-p1'}, (tag, version)
notes=(root/'docs/RELEASE_TAGS.md').read_text()
release=(root/'docs/MARKETPLACE_RELEASE_NOTES.md').read_text()
for text_name, text in [('docs/RELEASE_TAGS.md', notes), ('docs/MARKETPLACE_RELEASE_NOTES.md', release)]:
    assert tag in text, text_name
    assert package in text, text_name
print('release-tag-policy=ok tag=%s version=%s package=%s' % (tag, version, package))
PY
if [[ "$REMOTE" == 1 ]]; then
  SHA="$(git rev-parse "$TAG^{commit}")"
  REMOTE_SHA="$(git ls-remote --tags origin "refs/tags/$TAG^{}" | awk '{print $1}')"
  if [[ -z "$REMOTE_SHA" ]]; then
    REMOTE_SHA="$(git ls-remote --tags origin "refs/tags/$TAG" | awk '{print $1}')"
  fi
  test -n "$REMOTE_SHA"
  test "$SHA" = "$REMOTE_SHA"
  echo "release-tag-remote=ok tag=$TAG commit=${SHA:0:7}"
else
  git rev-parse --verify "$TAG^{commit}" >/dev/null
  SHA="$(git rev-parse "$TAG^{commit}")"
  echo "release-tag=ok tag=$TAG commit=${SHA:0:7}"
fi
