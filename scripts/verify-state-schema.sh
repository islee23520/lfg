#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$REPO_ROOT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json status >/tmp/lfg-state-status.json
SCHEMA="$TMP/state/schema.json"
test -s "$SCHEMA"
python3 - <<'PY' "$SCHEMA" /tmp/lfg-state-status.json
import json, pathlib, sys
schema=json.loads(pathlib.Path(sys.argv[1]).read_text())
status=json.loads(pathlib.Path(sys.argv[2]).read_text())
assert schema['name'] == 'lfg-state', schema
assert schema['version'] == 1, schema
assert schema['stateDir'].endswith('/state'), schema
assert schema['runsDir'].endswith('/runs'), schema
assert schema['migrations'] and schema['migrations'][-1]['to'] == 1, schema
assert status['ok'] is True, status
print('state-schema-file=ok version=%s' % schema['version'])
PY
GROK_PLUGIN_DATA="$TMP" plugins/lfg/bin/lfg --json doctor >/tmp/lfg-state-doctor.json
python3 - <<'PY'
import json
obj=json.load(open('/tmp/lfg-state-doctor.json'))
checks={c['name']:c for c in obj['checks']}
assert obj['ok'], obj
assert checks['state_schema']['ok'], checks['state_schema']
assert 'version=1' in checks['state_schema']['evidence'], checks['state_schema']
print('state-schema-doctor=ok')
PY

echo "state-schema-versioning=ok"
