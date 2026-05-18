#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
python3 - <<'PY'
import json, pathlib
root = pathlib.Path('.')
plugin = json.loads((root / 'plugins/lfg/.grok-plugin/plugin.json').read_text())
market = json.loads((root / '.grok/plugins/marketplace.json').read_text())
notes = (root / 'docs/MARKETPLACE_RELEASE_NOTES.md').read_text()
entry = market['plugins'][0]
required = [
    plugin['version'],
    plugin['metadata']['packageName'],
    entry['source']['url'],
    entry['source']['path'],
    plugin['metadata']['reference'],
    'runtime-smoke-coverage=100%',
    'grok-install-smoke=ok skills=28 key_skills_present',
    'lfg-launch-smoke=ok',
    'team-tmux-lifecycle=ok',
    'mcp-stdio-isolation=ok',
    'state-schema-versioning=ok',
    'remote-smoke=ok',
    '/plugins',
]
missing = [x for x in required if x not in notes]
assert not missing, missing
assert 'lfg 0.3.0' in notes, 'missing version heading'
print('release-notes=ok version=%s package=%s' % (plugin['version'], plugin['metadata']['packageName']))
PY
