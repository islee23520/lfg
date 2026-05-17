#!/usr/bin/env bash
set -euo pipefail
BRANCH="${1:-p1}"
HEAD_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
RUN_JSON="$(gh run list --branch "$BRANCH" --limit 20 --json databaseId,headSha,status,conclusion,workflowName,url)"
RUN_ID="$(RUN_JSON="$RUN_JSON" HEAD_SHA="$HEAD_SHA" python3 - <<'PY'
import json, os
runs = json.loads(os.environ["RUN_JSON"])
head = os.environ["HEAD_SHA"]
for run in runs:
    if run.get("headSha") == head and run.get("workflowName") == "grok-build smoke":
        print(run["databaseId"])
        break
else:
    raise SystemExit(f"no grok-build smoke run found for {head}")
PY
)"
gh run view "$RUN_ID" --json databaseId,headSha,status,conclusion,workflowName,jobs,url > /tmp/grok-build-remote-smoke.json
python3 - <<'PY' /tmp/grok-build-remote-smoke.json "$HEAD_SHA" "$SHORT_SHA"
import json, sys
run = json.load(open(sys.argv[1]))
head, short = sys.argv[2], sys.argv[3]
assert run["headSha"] == head, (run["headSha"], head)
assert run["workflowName"] == "grok-build smoke", run["workflowName"]
assert run["status"] == "completed", run["status"]
assert run["conclusion"] == "success", run["conclusion"]
jobs = run.get("jobs", [])
assert jobs and jobs[0]["name"] == "smoke", jobs
assert jobs[0]["conclusion"] == "success", jobs[0]
steps = {step["name"]: step["conclusion"] for step in jobs[0].get("steps", [])}
for required in ["Install runtime dependencies", "Verify Python syntax", "Run plugin self-test"]:
    assert steps.get(required) == "success", (required, steps.get(required))
print(f"remote-smoke=ok commit={short} run={run['databaseId']} url={run['url']}")
PY
