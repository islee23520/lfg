#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
BRANCH=""
if [[ "${1:-}" == "--remote" ]]; then
  BRANCH="${2:-p1}"
fi
python3 - <<'PY' "$BRANCH"
import json, pathlib, sys, urllib.request
branch = sys.argv[1]
root = pathlib.Path('.')
expected = {
    'marketplace': 'linalab-io',
    'package': 'linalab-io/lfg',
    'plugin': 'lfg',
    'path': 'plugins/lfg',
    'repo': 'https://github.com/islee23520/lfg.git',
    'reference': 'https://github.com/Yeachan-Heo/oh-my-codex',
    'main_url': 'https://raw.githubusercontent.com/islee23520/lfg/main/.grok/plugins/marketplace.json',
    'p1_url': 'https://raw.githubusercontent.com/islee23520/lfg/p1/.grok/plugins/marketplace.json',
}

def check_marketplace(data, label):
    assert data['name'] == expected['marketplace'], (label, data.get('name'))
    plugin = data['plugins'][0]
    assert plugin['name'] == expected['plugin'], (label, plugin)
    assert plugin['source']['url'] == expected['repo'], (label, plugin['source'])
    assert plugin['source']['path'] == expected['path'], (label, plugin['source'])
    assert plugin['metadata']['packageName'] == expected['package'], (label, plugin['metadata'])
    assert plugin['metadata']['reference'] == expected['reference'], (label, plugin['metadata'])

for rel in ['.grok/plugins/marketplace.json', '.agents/plugins/marketplace.json']:
    check_marketplace(json.loads((root / rel).read_text()), rel)

texts = {
    'README.md': (root / 'README.md').read_text(),
    'docs/MARKETPLACE_INSTALL.md': (root / 'docs/MARKETPLACE_INSTALL.md').read_text(),
    'docs/MARKETPLACE_RELEASE_NOTES.md': (root / 'docs/MARKETPLACE_RELEASE_NOTES.md').read_text(),
}
for name, text in texts.items():
    for key in ['package', 'plugin', 'path', 'repo', 'reference']:
        assert expected[key] in text, (name, expected[key])
    assert '/plugins' in text, name
assert expected['main_url'] in texts['README.md'], 'README stable raw URL'
assert expected['main_url'] in texts['docs/MARKETPLACE_INSTALL.md'], 'install stable raw URL'
assert expected['p1_url'] in texts['docs/MARKETPLACE_INSTALL.md'], 'install p1 raw URL'

if branch:
    for rel in ['.grok/plugins/marketplace.json', '.agents/plugins/marketplace.json']:
        url = f'https://raw.githubusercontent.com/islee23520/lfg/{branch}/{rel}'
        with urllib.request.urlopen(url, timeout=20) as res:
            remote = json.loads(res.read().decode('utf-8'))
        check_marketplace(remote, url)
    print('marketplace-remote-source=ok branch=%s' % branch)
print('marketplace-source=ok package=%s' % expected['package'])
PY
