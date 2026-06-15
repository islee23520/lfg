#!/usr/bin/env node

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  // T7: Strict JSON parsing for OMO hook parity. Payload text is data, never executed as shell. Malformed rejected.
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.stderr.write("T7-OMO-HOOK-ERROR: malformed JSON payload\n");
    process.exit(1);
  }
  if (payload.hook_event_name !== "UserPromptSubmit") {
    process.exit(2);
  }
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "lfg fixture ultrawork-directive-ok",
      },
    })}\n`,
  );
});
