#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
DEST="${GROK_BUILD_PLUGIN_DEST:-$HOME/.grok/plugins/grok-build}"
GROK_BIN="${GROK_BIN:-$HOME/.grok/bin/grok}"
OUT="${GROK_INSPECT_OUT:-/tmp/grok-build-inspect.json}"

mkdir -p "$(dirname "$DEST")"
rsync -a --delete "$ROOT/" "$DEST/"
echo "plugin-sync=ok dest=$DEST"

test -x "$GROK_BIN" || { echo "grok-binary=missing path=$GROK_BIN" >&2; exit 1; }
"$GROK_BIN" --cwd /tmp inspect --json >"$OUT"
python3 - <<'PY' "$OUT"
import json, sys
obj = json.load(open(sys.argv[1]))
skills = [s.get("name") for s in obj.get("skills", []) if "grok-build" in json.dumps(s) or "/grok-build/" in json.dumps(s)]
required = {
    "team", "ultrawork", "autopilot", "ralplan", "autoresearch-goal",
    "performance-goal", "visual-ralph", "omx-setup", "doctor", "wiki",
}
missing = sorted(required - set(skills))
assert not missing, missing
assert len(skills) == 28, (len(skills), sorted(skills))
print("grok-install-smoke=ok skills=28 key_skills_present")
PY
echo "inspect-json=$OUT"
