#!/usr/bin/env node

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  // T7: Strict JSON parsing for OMO hook parity (rules component). Malformed input rejected; no shell execution of prompt data.
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.stderr.write("LFG-PORT7-OMO-HOOK-ERROR: malformed JSON payload\n");
    process.exit(1);
  }
  if (payload.hook_event_name !== "SessionStart") {
    process.exit(2);
  }
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: "lfg fixture rules-context-ok",
      },
    })}\n`,
  );
});
