// @bun
// vendor/omo-standalone/packages/adapter-opencode/src/index.ts
import { createFileUlwLoopStateStore, createUlwLoopStateController } from "@oh-my-opencode/ulw-loop-state";
import { createUlwLoopEngine, runTrackedUlw } from "@oh-my-opencode/ulw-kernel";
import { resolveModelAgentGuard } from "@oh-my-opencode/hooks-core";
function createOpenCodeUlwHost(options) {
  return {
    async dispatchPrompt(request) {
      const prompt = options.client.session.promptAsync ?? options.client.session.prompt;
      if (!prompt)
        return { accepted: false, sessionID: request.sessionID, dispatchID: request.sessionID };
      const response = await prompt({
        path: { id: request.sessionID },
        body: {
          parts: [{ type: "text", text: request.message }],
          ...request.agentName ? { agent: request.agentName } : {},
          ...request.modelID ? { modelID: request.modelID } : {}
        },
        query: options.directory ? { directory: options.directory } : undefined
      });
      return { accepted: promptAccepted(response), sessionID: request.sessionID, dispatchID: extractDispatchID(response) ?? request.sessionID };
    },
    async readMessages(sessionID) {
      return normalizeMessages(await options.client.session.messages({
        path: { id: sessionID },
        query: options.directory ? { directory: options.directory } : undefined
      }));
    },
    async readTodos(sessionID) {
      const todos = await options.client.session.todos?.({
        path: { id: sessionID },
        query: options.directory ? { directory: options.directory } : undefined
      });
      return normalizeTodos(todos);
    },
    async readStatus(sessionID) {
      const status = await options.client.session.status?.({
        path: { id: sessionID },
        query: options.directory ? { directory: options.directory } : undefined
      });
      return normalizeStatus(status);
    },
    async abort(sessionID) {
      await options.client.session.abort({ path: { id: sessionID } });
    },
    onEvent(listener) {
      return options.subscribe?.(listener) ?? (() => {});
    }
  };
}
function createOpenCodeOmoPluginAdapter(options) {
  if (!options.directory && !options.loopState)
    throw new Error("OpenCode OMO plugin adapter requires directory or loopState");
  const host = createOpenCodeUlwHost(options);
  const loopState = options.loopState ?? createUlwLoopStateController(createFileUlwLoopStateStore(options.directory, options.statePath));
  const engine = createUlwLoopEngine({ host, loopState });
  return {
    host,
    loopState,
    engine,
    async handleUserMessage(input) {
      await runTrackedUlw({ host, loopState, sessionID: input.sessionID, text: input.text, agentName: input.agentName, modelID: input.modelID });
    },
    async handleChatMessage(input, output) {
      return applyOpenCodeModelAgentGuard(options, input, output);
    },
    stop() {
      engine.stop();
    }
  };
}
async function applyOpenCodeModelAgentGuard(options, input, output) {
  const decision = resolveModelAgentGuard(input.agent, input.model);
  if (decision.agent !== undefined)
    input.agent = decision.agent;
  if (decision.outputAgent !== undefined && output?.message)
    output.message.agent = decision.outputAgent;
  if (decision.variant !== undefined && output?.message && output.message.variant === undefined)
    output.message.variant = decision.variant;
  if (decision.toast)
    await options.showToast?.({ ...decision.toast, sessionID: input.sessionID });
  if (decision.sessionAgent)
    await options.updateSessionAgent?.({ sessionID: input.sessionID, agent: decision.sessionAgent });
  return decision;
}
function normalizeMessages(response) {
  return getArrayData(response).flatMap((message) => {
    if (!isRecord(message))
      return [];
    const role = normalizeRole(getNestedString(message, "info", "role") ?? getString(message, "role"));
    const text = collectMessageText(message);
    return role && text ? [{ role, text }] : [];
  });
}
function normalizeTodos(response) {
  return getArrayData(response).flatMap((todo) => {
    if (!isRecord(todo))
      return [];
    const content = getString(todo, "content") ?? getString(todo, "title");
    const status = normalizeTodoStatus(getString(todo, "status"));
    return content && status ? [{ content, status }] : [];
  });
}
function normalizeStatus(response) {
  if (typeof response === "string")
    return response;
  if (isRecord(response))
    return getString(response, "status") ?? getNestedString(response, "data", "status") ?? "unknown";
  return "unknown";
}
function collectMessageText(message) {
  const text = getString(message, "text") ?? getString(message, "content");
  if (text)
    return text;
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts.flatMap((part) => isRecord(part) ? [getString(part, "text") ?? ""] : []).filter(Boolean).join(`
`);
}
function getArrayData(response) {
  if (Array.isArray(response))
    return response;
  if (isRecord(response) && Array.isArray(response.data))
    return response.data;
  return [];
}
function hasError(response) {
  return isRecord(response) && response.error !== undefined && response.error !== null;
}
function promptAccepted(response) {
  if (hasError(response))
    return false;
  if (!isRecord(response))
    return true;
  const status = getString(response, "status");
  return status === undefined || status === "dispatched";
}
function extractDispatchID(response) {
  if (!isRecord(response))
    return;
  return getString(response, "id") ?? getString(response, "messageID") ?? getNestedString(response, "data", "id");
}
function normalizeRole(role) {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool")
    return role;
  return;
}
function normalizeTodoStatus(status) {
  if (status === "pending" || status === "in_progress" || status === "completed" || status === "cancelled")
    return status;
  return;
}
function getString(record, key) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function getNestedString(record, key, nestedKey) {
  const nested = record[key];
  return isRecord(nested) ? getString(nested, nestedKey) : undefined;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
export {
  createOpenCodeUlwHost,
  createOpenCodeOmoPluginAdapter,
  applyOpenCodeModelAgentGuard
};
