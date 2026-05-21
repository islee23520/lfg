// @bun
// vendor/omo-standalone/packages/standalone-runtime/src/index.ts
import { listOmoHooks, summarizeOmoHookPorting } from "@oh-my-opencode/hooks-core";
import { createBuiltinSkills } from "@oh-my-opencode/skills-core";
import { createUlwLoopEngine, runTrackedUlw } from "@oh-my-opencode/ulw-kernel";
import { createMemoryUlwLoopStateStore, createUlwLoopStateController } from "@oh-my-opencode/ulw-loop-state";
function createStandaloneOmoRuntime() {
  const messagesBySession = new Map;
  const listeners = new Set;
  const dispatchedPrompts = [];
  const loopState = createUlwLoopStateController(createMemoryUlwLoopStateStore());
  const skills = createBuiltinSkills({ teamModeEnabled: true });
  const hooks = listOmoHooks();
  const host = {
    async dispatchPrompt(request) {
      dispatchedPrompts.push(request);
      appendMessage(messagesBySession, request.sessionID, { role: "user", text: request.message });
      return { accepted: true, sessionID: request.sessionID, dispatchID: `runtime-dispatch-${dispatchedPrompts.length}` };
    },
    async readMessages(sessionID) {
      return messagesBySession.get(sessionID) ?? [];
    },
    async readTodos() {
      return [];
    },
    async readStatus() {
      return "idle";
    },
    async abort() {},
    onEvent(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
  const engine = createUlwLoopEngine({ host, loopState });
  return {
    host,
    loopState,
    engine,
    skills,
    hooks,
    dispatchedPrompts,
    async submitUserMessage(input) {
      appendMessage(messagesBySession, input.sessionID, { role: "user", text: input.text });
      await runTrackedUlw({ host, loopState, sessionID: input.sessionID, text: input.text });
    },
    appendAssistantMessage(sessionID, text) {
      appendMessage(messagesBySession, sessionID, { role: "assistant", text });
    },
    async emitIdle(sessionID) {
      for (const listener of listeners)
        listener({ type: "idle", sessionID });
      await flushEventHandlers();
    },
    readMessages(sessionID) {
      return messagesBySession.get(sessionID) ?? [];
    },
    stop() {
      engine.stop();
    }
  };
}
function appendMessage(messagesBySession, sessionID, message) {
  messagesBySession.set(sessionID, [...messagesBySession.get(sessionID) ?? [], message]);
}
async function flushEventHandlers() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function runStandaloneOmo() {
  const runtime = createStandaloneOmoRuntime();
  await runtime.submitUserMessage({ sessionID: "runtime-session", text: "ulw build standalone" });
  await runtime.emitIdle("runtime-session");
  runtime.appendAssistantMessage("runtime-session", "<promise>DONE</promise>");
  await runtime.emitIdle("runtime-session");
  runtime.appendAssistantMessage("runtime-session", "<promise>VERIFIED</promise>");
  await runtime.emitIdle("runtime-session");
  runtime.stop();
  return {
    prompts: runtime.dispatchedPrompts.map((prompt) => prompt.message),
    finalState: runtime.loopState.getState(),
    skillNames: runtime.skills.map((skill) => skill.name),
    hookSummary: summarizeOmoHookPorting()
  };
}
export {
  runStandaloneOmo,
  createStandaloneOmoRuntime
};
