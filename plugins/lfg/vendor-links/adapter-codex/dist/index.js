// @bun
// vendor/omo-standalone/packages/adapter-codex/src/index.ts
import { createMemoryUlwLoopStateStore, createUlwLoopStateController } from "@oh-my-opencode/ulw-loop-state";
import { createUlwLoopEngine, runTrackedUlw } from "@oh-my-opencode/ulw-kernel";
function createCodexUlwHost(client) {
  return {
    async dispatchPrompt(request) {
      const result = await client.conversation.send({
        conversationID: request.sessionID,
        input: request.message,
        ...request.agentName ? { agent: request.agentName } : {},
        ...request.modelID ? { model: request.modelID } : {}
      });
      return normalizeCodexSendResult(request, result);
    },
    async readMessages(sessionID) {
      return normalizeCodexMessages(await client.conversation.transcript({ conversationID: sessionID }));
    },
    readTodos() {
      return Promise.resolve([]);
    },
    readStatus(sessionID) {
      return client.conversation.status?.({ conversationID: sessionID }).then(normalizeCodexStatus) ?? Promise.resolve("unknown");
    },
    async abort(sessionID) {
      return client.conversation.abort?.({ conversationID: sessionID }).then(() => {}) ?? Promise.resolve();
    },
    onEvent(listener) {
      return client.conversation.onEvent?.((event) => {
        if (event.type === "idle")
          listener({ type: "idle", sessionID: event.conversationID });
      }) ?? (() => {});
    }
  };
}
function createCodexOmoAdapter(options) {
  const host = createCodexUlwHost(options.client);
  const loopState = options.loopState ?? createUlwLoopStateController(createMemoryUlwLoopStateStore());
  const engine = createUlwLoopEngine({ host, loopState });
  return {
    host,
    loopState,
    engine,
    async handleUserMessage(input) {
      await runTrackedUlw({ host, loopState, sessionID: input.sessionID, text: input.text, agentName: input.agentName, modelID: input.modelID });
    },
    stop() {
      engine.stop();
    }
  };
}
function normalizeCodexSendResult(request, result) {
  if (typeof result === "string")
    return { accepted: true, sessionID: request.sessionID, dispatchID: result };
  const accepted = result.error === undefined && result.status !== "failed" && result.status !== "rejected" && result.accepted !== false;
  return { accepted, sessionID: request.sessionID, dispatchID: result.id ?? result.itemID ?? request.sessionID };
}
function normalizeCodexMessages(result) {
  const items = Array.isArray(result) ? result : result.items ?? [];
  return items.flatMap((item) => {
    const role = normalizeRole(item.role);
    const text = collectCodexText(item);
    return role && text ? [{ role, text }] : [];
  });
}
function normalizeCodexStatus(result) {
  if (typeof result === "string")
    return result;
  return result.status ?? "unknown";
}
function collectCodexText(item) {
  if (item.text)
    return item.text;
  if (typeof item.content === "string")
    return item.content;
  if (Array.isArray(item.content))
    return item.content.flatMap((part) => part.text ? [part.text] : []).join(`
`);
  return "";
}
function normalizeRole(role) {
  if (role === "user" || role === "assistant" || role === "system" || role === "tool")
    return role;
  return;
}
export {
  createCodexUlwHost,
  createCodexOmoAdapter
};
