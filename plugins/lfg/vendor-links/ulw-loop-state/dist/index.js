// @bun
// vendor/omo-standalone/packages/ulw-loop-state/src/index.ts
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, unlinkSync, writeSync } from "fs";
import { dirname, isAbsolute, relative, resolve } from "path";
import { parseFrontmatter } from "@oh-my-opencode/utils";
var DEFAULT_COMPLETION_PROMISE = "DONE";
var ULTRAWORK_VERIFICATION_PROMISE = "VERIFIED";
var DEFAULT_MAX_ITERATIONS = 100;
var ULTRAWORK_MAX_ITERATIONS = 500;
var DEFAULT_STATE_FILE = ".omo/ulw-loop.local.md";
function getUlwLoopStateFilePath(directory, customPath) {
  const basePath = normalizeDarwinRealpath(resolve(directory));
  const statePath = normalizeDarwinRealpath(resolve(basePath, customPath ?? DEFAULT_STATE_FILE));
  if (!isPathInside(statePath, basePath))
    throw new Error("ULW loop state path must stay inside the base directory");
  return statePath;
}
function createMemoryUlwLoopStateStore(initialState = null) {
  let state = initialState;
  return {
    read() {
      return state ? { ...state } : null;
    },
    write(nextState) {
      state = { ...nextState };
    },
    clear() {
      state = null;
    }
  };
}
function createFileUlwLoopStateStore(directory, customPath) {
  const basePath = normalizeDarwinRealpath(resolve(directory));
  const filePath = getUlwLoopStateFilePath(directory, customPath);
  return {
    read() {
      if (!isSafeStatePath(filePath, basePath))
        return null;
      return readUlwLoopStateFile(filePath);
    },
    write(state) {
      writeUlwLoopStateFile(filePath, state, basePath);
    },
    clear() {
      if (isSafeStatePath(filePath, basePath) && existsSync(filePath) && !lstatSync(filePath).isSymbolicLink())
        unlinkSync(filePath);
    }
  };
}
function readUlwLoopStateFile(filePath) {
  if (!existsSync(filePath))
    return null;
  try {
    if (lstatSync(filePath).isSymbolicLink())
      return null;
    const content = readFileSync(filePath, "utf-8");
    const { data, body } = parseFrontmatter(content);
    const active = data.active === true || data.active === "true";
    const iteration = toNumber(data.iteration);
    if (data.active === undefined || iteration === undefined)
      return null;
    const maxIterations = toNumber(data.max_iterations) ?? DEFAULT_MAX_ITERATIONS;
    const completionPromise = stripQuotes(data.completion_promise) || DEFAULT_COMPLETION_PROMISE;
    const strategy = data.strategy === "reset" || data.strategy === "continue" ? data.strategy : "continue";
    return {
      active,
      iteration,
      maxIterations,
      completionPromise,
      initialCompletionPromise: stripQuotes(data.initial_completion_promise) || completionPromise,
      startedAt: stripQuotes(data.started_at) || new Date().toISOString(),
      prompt: body.trim(),
      sessionID: stripQuotes(data.session_id),
      messageCountAtStart: toNumber(data.message_count_at_start),
      verificationPending: data.verification_pending === true || data.verification_pending === "true" ? true : undefined,
      verificationAttemptID: stripQuotes(data.verification_attempt_id),
      verificationSessionID: stripQuotes(data.verification_session_id),
      strategy,
      ultrawork: data.ultrawork === true || data.ultrawork === "true" ? true : undefined
    };
  } catch {
    return null;
  }
}
function writeUlwLoopStateFile(filePath, state, basePath = dirname(filePath)) {
  mkdirSync(dirname(filePath), { recursive: true });
  if (!isPathInside(normalizeDarwinRealpath(realpathSync(dirname(filePath))), basePath))
    throw new Error("ULW loop state parent path must stay inside the base directory");
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink())
    throw new Error("ULW loop state file must not be a symlink");
  const fd = openSync(filePath, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | constants.O_NOFOLLOW, 384);
  try {
    writeSync(fd, serializeUlwLoopState(state), undefined, "utf-8");
  } finally {
    closeSync(fd);
  }
}
function serializeUlwLoopState(state) {
  const lines = [
    "---",
    `active: ${state.active}`,
    `iteration: ${state.iteration}`,
    `max_iterations: ${state.maxIterations}`,
    `completion_promise: ${quoteYamlString(state.completionPromise)}`,
    `initial_completion_promise: ${quoteYamlString(state.initialCompletionPromise)}`,
    `started_at: ${quoteYamlString(state.startedAt)}`,
    `session_id: ${quoteYamlString(state.sessionID)}`,
    `strategy: ${quoteYamlString(state.strategy)}`
  ];
  if (typeof state.messageCountAtStart === "number")
    lines.push(`message_count_at_start: ${state.messageCountAtStart}`);
  if (state.ultrawork)
    lines.push("ultrawork: true");
  if (state.verificationPending)
    lines.push("verification_pending: true");
  if (state.verificationAttemptID)
    lines.push(`verification_attempt_id: ${quoteYamlString(state.verificationAttemptID)}`);
  if (state.verificationSessionID)
    lines.push(`verification_session_id: ${quoteYamlString(state.verificationSessionID)}`);
  return `${lines.join(`
`)}
---
${state.prompt}
`;
}
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value !== "string" || value.trim() === "")
    return;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function stripQuotes(value) {
  return String(value ?? "").replace(/^["']|["']$/g, "");
}
function quoteYamlString(value) {
  return JSON.stringify(value);
}
function isPathInside(targetPath, basePath) {
  const relation = relative(basePath, targetPath);
  return relation === "" || !relation.startsWith("..") && !isAbsolute(relation);
}
function isSafeStatePath(filePath, basePath) {
  try {
    return isPathInside(normalizeDarwinRealpath(realpathSync(dirname(filePath))), basePath);
  } catch {
    return false;
  }
}
function normalizeDarwinRealpath(filePath) {
  return filePath.startsWith("/private/var/") ? filePath.slice("/private".length) : filePath;
}
function createUlwLoopStateController(store) {
  return {
    start(options) {
      const completionPromise = options.completionPromise ?? DEFAULT_COMPLETION_PROMISE;
      const state = {
        active: true,
        iteration: 1,
        maxIterations: options.ultrawork ? ULTRAWORK_MAX_ITERATIONS : options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
        completionPromise,
        initialCompletionPromise: completionPromise,
        startedAt: options.now?.() ?? new Date().toISOString(),
        prompt: options.prompt,
        sessionID: options.sessionID,
        messageCountAtStart: options.messageCountAtStart,
        strategy: options.strategy ?? "continue",
        ultrawork: options.ultrawork ? true : undefined
      };
      store.write(state);
      return state;
    },
    cancel(sessionID) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID)
        return false;
      store.clear();
      return true;
    },
    getState() {
      return store.read();
    },
    clear() {
      store.clear();
    },
    incrementIteration(expected) {
      const state = store.read();
      if (!state)
        return null;
      if (expected && (state.iteration !== expected.iteration || state.sessionID !== expected.sessionID))
        return null;
      const nextState = { ...state, iteration: state.iteration + 1 };
      store.write(nextState);
      return nextState;
    },
    markVerificationPending(sessionID, messageCountAtStart) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID || !state.ultrawork)
        return null;
      const nextState = {
        ...state,
        completionPromise: ULTRAWORK_VERIFICATION_PROMISE,
        messageCountAtStart: messageCountAtStart ?? state.messageCountAtStart,
        verificationPending: true,
        verificationAttemptID: undefined,
        verificationSessionID: undefined
      };
      store.write(nextState);
      return nextState;
    },
    setSessionID(sessionID, nextSessionID) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID)
        return null;
      const nextState = { ...state, sessionID: nextSessionID };
      store.write(nextState);
      return nextState;
    },
    setMessageCountAtStart(sessionID, count, expectedStartedAt) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID)
        return null;
      if (state.iteration !== 1 || state.verificationPending || state.messageCountAtStart !== undefined)
        return null;
      if (expectedStartedAt && state.startedAt !== expectedStartedAt)
        return null;
      const nextState = { ...state, messageCountAtStart: count };
      store.write(nextState);
      return nextState;
    },
    setVerificationSessionID(sessionID, verificationSessionID) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID || !state.ultrawork || !state.verificationPending)
        return null;
      const nextState = { ...state, verificationSessionID };
      store.write(nextState);
      return nextState;
    },
    restartAfterFailedVerification(sessionID, messageCountAtStart) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID || !state.ultrawork || !state.verificationPending)
        return null;
      const nextState = {
        ...state,
        iteration: state.iteration + 1,
        completionPromise: state.initialCompletionPromise,
        startedAt: new Date().toISOString(),
        verificationPending: undefined,
        verificationAttemptID: undefined,
        verificationSessionID: undefined,
        messageCountAtStart: messageCountAtStart ?? state.messageCountAtStart
      };
      store.write(nextState);
      return nextState;
    },
    clearVerificationState(sessionID, messageCountAtStart) {
      const state = store.read();
      if (!state || state.sessionID !== sessionID || !state.ultrawork || !state.verificationPending)
        return null;
      const nextState = {
        ...state,
        completionPromise: state.initialCompletionPromise,
        startedAt: new Date().toISOString(),
        verificationPending: undefined,
        verificationAttemptID: undefined,
        verificationSessionID: undefined,
        messageCountAtStart: messageCountAtStart ?? state.messageCountAtStart
      };
      store.write(nextState);
      return nextState;
    }
  };
}
export {
  writeUlwLoopStateFile,
  serializeUlwLoopState,
  readUlwLoopStateFile,
  getUlwLoopStateFilePath,
  createUlwLoopStateController,
  createMemoryUlwLoopStateStore,
  createFileUlwLoopStateStore,
  ULTRAWORK_VERIFICATION_PROMISE,
  ULTRAWORK_MAX_ITERATIONS,
  DEFAULT_STATE_FILE,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_COMPLETION_PROMISE
};
