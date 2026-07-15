#!/usr/bin/env python3
import json
import os
import sys
import io
import traceback
from contextlib import redirect_stdout, redirect_stderr

workdir = os.environ.get("LFG_EVAL_CWD") or os.getcwd()
os.chdir(workdir)
g = {"__name__": "__main__"}

sys.stdout.write(json.dumps({"op": "ready", "ready": True}) + "\n")
sys.stdout.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except Exception:
        continue
    if not isinstance(msg, dict):
        continue
    op = msg.get("op")
    mid = msg.get("id")
    if op == "shutdown":
        break
    if op != "exec":
        sys.stdout.write(json.dumps({"id": mid, "ok": False, "error": "unknown op"}) + "\n")
        sys.stdout.flush()
        continue
    code = msg.get("code") or ""
    out_buf = io.StringIO()
    err_buf = io.StringIO()
    ok = True
    err = None
    try:
        with redirect_stdout(out_buf), redirect_stderr(err_buf):
            exec(compile(code, "<eval-cell>", "exec"), g, g)
    except Exception:
        ok = False
        err = traceback.format_exc()
    sys.stdout.write(
        json.dumps(
            {
                "id": mid,
                "ok": ok,
                "stdout": out_buf.getvalue(),
                "stderr": err_buf.getvalue(),
                "error": err,
            }
        )
        + "\n"
    )
    sys.stdout.flush()
