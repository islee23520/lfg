// @bun
// vendor/omo-standalone/packages/ulw-kernel/src/index.ts
import { detectUlwIntent } from "@oh-my-opencode/ulw-intent";
async function runUlw(input) {
  const intents = detectUlwIntent(input.text);
  const receipts = [];
  for (const intent of intents) {
    receipts.push(await input.host.dispatchPrompt({
      sessionID: input.sessionID,
      message: intent.prompt,
      agentName: input.agentName,
      modelID: input.modelID
    }));
  }
  return {
    dispatched: receipts.some((receipt) => receipt.accepted),
    intents: intents.map((intent) => intent.type),
    receipts
  };
}
async function runTrackedUlw(input) {
  const messageCountAtStart = (await input.host.readMessages(input.sessionID)).length;
  const result = await runUlw(input);
  if (hasAcceptedTrackedUlwIntent(result)) {
    input.loopState.start({
      sessionID: input.sessionID,
      prompt: input.text,
      completionPromise: input.completionPromise,
      messageCountAtStart,
      ultrawork: true
    });
  }
  return result;
}
function hasAcceptedTrackedUlwIntent(result) {
  return result.intents.some((intent, index) => isTrackedUlwIntent(intent) && result.receipts[index]?.accepted === true);
}
function isTrackedUlwIntent(intent) {
  return intent === "ultrawork" || intent === "hyperplan-ultrawork";
}
function createUlwLoopEngine(options) {
  const unsubscribe = options.host.onEvent((event) => {
    if (event.type !== "idle")
      return;
    handleUlwLoopIdle(options, event.sessionID);
  });
  return { stop: unsubscribe };
}
async function handleUlwLoopIdle(options, sessionID) {
  const state = options.loopState.getState();
  if (!state?.active || state.sessionID !== sessionID)
    return;
  if (await completionDetected(options.host, state, sessionID)) {
    await handleDetectedCompletion(options, state, sessionID);
    return;
  }
  if (state.verificationPending) {
    await handlePendingVerification(options, state, sessionID);
    return;
  }
  if (state.iteration >= state.maxIterations) {
    options.loopState.clear();
    return;
  }
  const nextIteration = state.iteration + 1;
  const receipt = await options.host.dispatchPrompt({
    sessionID,
    message: buildContinuationPrompt({ ...state, iteration: nextIteration })
  });
  if (!receipt.accepted) {
    options.loopState.clear();
    return;
  }
  options.loopState.incrementIteration({ iteration: state.iteration, sessionID });
}
function buildContinuationPrompt(state) {
  if (state.verificationPending) {
    return `ultrawork [SYSTEM DIRECTIVE: OH-MY-OPENCODE - ULTRAWORK LOOP VERIFICATION ${state.iteration}/${state.maxIterations}]

You already emitted <promise>${state.initialCompletionPromise}</promise>. This does NOT finish the loop yet.

REQUIRED NOW:
- Call Oracle using task(subagent_type="oracle", load_skills=[], run_in_background=false, ...)
- Ask Oracle to verify whether the original task is actually complete
- Include the original task in the Oracle request
- Explicitly tell Oracle to review skeptically and critically, and to look for reasons the task may still be incomplete or wrong
- The system will inspect the Oracle session directly for the verification result
- If Oracle does not verify, continue fixing the task and do not consider it complete

Original task:
${state.prompt}`;
  }
  return `ultrawork [SYSTEM DIRECTIVE: OH-MY-OPENCODE - RALPH LOOP ${state.iteration}/${state.maxIterations}]
Continue. Output <promise>${state.completionPromise}</promise> when done.
${state.prompt}`;
}
function buildVerificationFailurePrompt(state) {
  return `ultrawork [SYSTEM DIRECTIVE: OH-MY-OPENCODE - ULTRAWORK LOOP VERIFICATION FAILED ${state.iteration}/${state.maxIterations}]

Oracle did not emit <promise>VERIFIED</promise>. Verification failed.

REQUIRED NOW:
- Verification failed. Fix the task until Oracle's review is satisfied
- Oracle does not lie. Treat the verification result as ground truth
- Do not claim completion early or argue with the failed verification
- After fixing the remaining issues, request Oracle review again using task(subagent_type="oracle", load_skills=[], run_in_background=false, ...)
- Include the original task in the Oracle request and tell Oracle to review skeptically and critically
- Only when the work is ready for review again, output: <promise>${state.initialCompletionPromise}</promise>

Original task:
${state.prompt}`;
}
async function completionDetected(host, state, sessionID) {
  const messages = await host.readMessages(sessionID);
  return messages.slice(state.messageCountAtStart ?? 0).some((message) => message.role === "assistant" && message.text.includes(`<promise>${state.completionPromise}</promise>`));
}
async function handleDetectedCompletion(options, state, sessionID) {
  if (state.ultrawork && !state.verificationPending) {
    const verificationMessageCountAtStart = (await options.host.readMessages(sessionID)).length;
    const verificationState = options.loopState.markVerificationPending(sessionID, verificationMessageCountAtStart);
    if (!verificationState)
      return;
    const receipt = await options.host.dispatchPrompt({
      sessionID,
      message: buildContinuationPrompt(verificationState)
    });
    if (!receipt.accepted)
      options.loopState.clear();
    return;
  }
  options.loopState.clear();
}
async function handlePendingVerification(options, state, sessionID) {
  if (await oracleVerified(options.host, state, sessionID)) {
    options.loopState.clear();
    return;
  }
  if (state.iteration >= state.maxIterations) {
    options.loopState.clear();
    return;
  }
  const messageCountAtStart = (await options.host.readMessages(sessionID)).length;
  const previewState = {
    ...state,
    iteration: state.iteration + 1,
    verificationPending: undefined,
    verificationSessionID: undefined,
    messageCountAtStart
  };
  const receipt = await options.host.dispatchPrompt({
    sessionID,
    message: buildVerificationFailurePrompt(previewState)
  });
  if (!receipt.accepted) {
    options.loopState.clear();
    return;
  }
  const cleared = options.loopState.clearVerificationState(sessionID, messageCountAtStart);
  if (!cleared) {
    options.loopState.clear();
    return;
  }
  if (!options.loopState.incrementIteration({ iteration: cleared.iteration, sessionID }))
    options.loopState.clear();
}
async function oracleVerified(host, state, sessionID) {
  const messages = await host.readMessages(state.verificationSessionID ?? sessionID);
  return messages.slice(state.messageCountAtStart ?? 0).some((message) => message.role === "assistant" && message.text.includes("<promise>VERIFIED</promise>"));
}
export {
  runUlw,
  runTrackedUlw,
  handleUlwLoopIdle,
  createUlwLoopEngine,
  buildVerificationFailurePrompt,
  buildContinuationPrompt
};
