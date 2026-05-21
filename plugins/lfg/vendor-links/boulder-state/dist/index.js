// @bun
// vendor/omo-standalone/packages/boulder-state/src/constants.ts
var BOULDER_DIR = ".omo";
var BOULDER_FILE = "boulder.json";
var BOULDER_STATE_PATH = `${BOULDER_DIR}/${BOULDER_FILE}`;
var NOTEPAD_DIR = "notepads";
var NOTEPAD_BASE_PATH = `${BOULDER_DIR}/${NOTEPAD_DIR}`;
var PROMETHEUS_PLANS_DIR = ".omo/plans";
// vendor/omo-standalone/packages/boulder-state/src/top-level-task.ts
import { existsSync, readFileSync } from "fs";
var TODO_HEADING_PATTERN = /^##\s+TODOs\b/i;
var FINAL_VERIFICATION_HEADING_PATTERN = /^##\s+Final Verification Wave\b/i;
var SECOND_LEVEL_HEADING_PATTERN = /^##\s+/;
var UNCHECKED_CHECKBOX_PATTERN = /^(\s*)[-*]\s*\[\s*\]\s*(.+)$/;
var TODO_TASK_PATTERN = /^(\d+)\.\s+(.+)$/;
var FINAL_WAVE_TASK_PATTERN = /^(F\d+)\.\s+(.+)$/i;
function buildTaskRef(section, taskLabel) {
  const pattern = section === "todo" ? TODO_TASK_PATTERN : FINAL_WAVE_TASK_PATTERN;
  const match = taskLabel.match(pattern);
  if (!match) {
    return null;
  }
  const rawLabel = match[1];
  const title = match[2].trim();
  return {
    key: `${section}:${rawLabel.toLowerCase()}`,
    section,
    label: rawLabel,
    title
  };
}
function readCurrentTopLevelTask(planPath) {
  if (!existsSync(planPath)) {
    return null;
  }
  try {
    const content = readFileSync(planPath, "utf-8");
    const lines = content.split(/\r?\n/);
    let section = "other";
    for (const line of lines) {
      if (SECOND_LEVEL_HEADING_PATTERN.test(line)) {
        section = TODO_HEADING_PATTERN.test(line) ? "todo" : FINAL_VERIFICATION_HEADING_PATTERN.test(line) ? "final-wave" : "other";
      }
      const uncheckedTaskMatch = line.match(UNCHECKED_CHECKBOX_PATTERN);
      if (!uncheckedTaskMatch || uncheckedTaskMatch[1].length > 0) {
        continue;
      }
      if (section !== "todo" && section !== "final-wave") {
        continue;
      }
      const taskRef = buildTaskRef(section, uncheckedTaskMatch[2].trim());
      if (taskRef) {
        return taskRef;
      }
    }
    return null;
  } catch {
    return null;
  }
}
// vendor/omo-standalone/packages/boulder-state/src/storage/path.ts
import { existsSync as existsSync2 } from "fs";
import { isAbsolute, join, relative, resolve } from "path";
function getBoulderFilePath(directory) {
  return join(directory, BOULDER_DIR, BOULDER_FILE);
}
function resolveTrackedPath(baseDirectory, trackedPath) {
  return isAbsolute(trackedPath) ? resolve(trackedPath) : resolve(baseDirectory, trackedPath);
}
function resolveBoulderPlanPath(directory, state) {
  const absolutePlanPath = resolveTrackedPath(directory, state.active_plan);
  const worktreePath = state.worktree_path?.trim();
  if (!worktreePath) {
    return absolutePlanPath;
  }
  const absoluteDirectory = resolve(directory);
  const relativePlanPath = relative(absoluteDirectory, absolutePlanPath);
  if (relativePlanPath.length === 0 || relativePlanPath.startsWith("..") || isAbsolute(relativePlanPath)) {
    return absolutePlanPath;
  }
  const absoluteWorktreePath = resolveTrackedPath(directory, worktreePath);
  const worktreePlanPath = resolve(absoluteWorktreePath, relativePlanPath);
  return existsSync2(worktreePlanPath) ? worktreePlanPath : absolutePlanPath;
}
function resolveBoulderPlanPathForWork(directory, work) {
  return resolveBoulderPlanPath(directory, work);
}
// vendor/omo-standalone/packages/boulder-state/src/storage/plan-progress.ts
import { existsSync as existsSync3, readFileSync as readFileSync2, readdirSync, statSync } from "fs";
import { basename, join as join2 } from "path";
var TODO_HEADING_PATTERN2 = /^##\s+TODOs\b/i;
var FINAL_VERIFICATION_HEADING_PATTERN2 = /^##\s+Final Verification Wave\b/i;
var SECOND_LEVEL_HEADING_PATTERN2 = /^##\s+/;
var UNCHECKED_CHECKBOX_PATTERN2 = /^(\s*)[-*]\s*\[\s*\]\s*(.+)$/;
var CHECKED_CHECKBOX_PATTERN = /^(\s*)[-*]\s*\[[xX]\]\s*(.+)$/;
var TODO_TASK_PATTERN2 = /^\d+\.\s+/;
var FINAL_WAVE_TASK_PATTERN2 = /^F\d+\.\s+/i;
function findPrometheusPlans(directory) {
  const plansDir = join2(directory, PROMETHEUS_PLANS_DIR);
  if (!existsSync3(plansDir)) {
    return [];
  }
  try {
    return readdirSync(plansDir).filter((file) => file.endsWith(".md")).map((file) => join2(plansDir, file)).sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  } catch {
    return [];
  }
}
function getPlanName(planPath) {
  return basename(planPath, ".md");
}
function getPlanProgress(planPath) {
  if (!existsSync3(planPath)) {
    return { total: 0, completed: 0, isComplete: false };
  }
  try {
    const content = readFileSync2(planPath, "utf-8");
    const lines = content.split(/\r?\n/);
    const hasStructuredSections = lines.some((line) => TODO_HEADING_PATTERN2.test(line) || FINAL_VERIFICATION_HEADING_PATTERN2.test(line));
    if (hasStructuredSections) {
      return getStructuredPlanProgress(lines);
    }
    return getSimplePlanProgress(content);
  } catch {
    return { total: 0, completed: 0, isComplete: false };
  }
}
function getStructuredPlanProgress(lines) {
  let section = "other";
  let total = 0;
  let completed = 0;
  for (const line of lines) {
    if (SECOND_LEVEL_HEADING_PATTERN2.test(line)) {
      section = TODO_HEADING_PATTERN2.test(line) ? "todo" : FINAL_VERIFICATION_HEADING_PATTERN2.test(line) ? "final-wave" : "other";
      continue;
    }
    if (section !== "todo" && section !== "final-wave") {
      continue;
    }
    const checkedMatch = line.match(CHECKED_CHECKBOX_PATTERN);
    const uncheckedMatch = checkedMatch ? null : line.match(UNCHECKED_CHECKBOX_PATTERN2);
    const match = checkedMatch ?? uncheckedMatch;
    if (!match || match[1].length > 0) {
      continue;
    }
    const taskBody = match[2].trim();
    const labelPattern = section === "todo" ? TODO_TASK_PATTERN2 : FINAL_WAVE_TASK_PATTERN2;
    if (!labelPattern.test(taskBody)) {
      continue;
    }
    total += 1;
    if (checkedMatch) {
      completed += 1;
    }
  }
  return { total, completed, isComplete: total > 0 && completed === total };
}
function getSimplePlanProgress(content) {
  const uncheckedMatches = content.match(/^[-*]\s*\[\s*\]/gm) ?? [];
  const checkedMatches = content.match(/^[-*]\s*\[[xX]\]/gm) ?? [];
  const total = uncheckedMatches.length + checkedMatches.length;
  const completed = checkedMatches.length;
  return { total, completed, isComplete: total > 0 && completed === total };
}
// vendor/omo-standalone/packages/boulder-state/src/storage/read-state.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "fs";

// vendor/omo-standalone/packages/boulder-state/src/storage/shared.ts
var RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
function nowIsoString() {
  return new Date().toISOString();
}
function parseIsoToMs(value) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function getElapsedMs(startedAt, endedAt) {
  const startedMs = parseIsoToMs(startedAt);
  const endedMs = parseIsoToMs(endedAt);
  if (startedMs === null || endedMs === null) {
    return;
  }
  return endedMs - startedMs;
}
function isValidWorkStatus(status) {
  return status === "active" || status === "completed" || status === "paused" || status === "abandoned";
}
function buildWorkFromMirror(state) {
  const planName = state.plan_name ?? state.active_plan;
  const workId = `${planName}-legacy`;
  return {
    work_id: workId,
    active_plan: state.active_plan,
    plan_name: planName,
    status: state.status,
    started_at: state.started_at,
    ended_at: state.ended_at,
    elapsed_ms: state.elapsed_ms,
    updated_at: state.updated_at,
    session_ids: Array.isArray(state.session_ids) ? [...state.session_ids] : [],
    session_origins: state.session_origins,
    agent: state.agent,
    worktree_path: state.worktree_path,
    task_sessions: state.task_sessions
  };
}
function projectWorkToMirror(state, work) {
  state.active_plan = work.active_plan;
  state.plan_name = work.plan_name;
  state.status = work.status;
  state.started_at = work.started_at;
  state.ended_at = work.ended_at;
  state.elapsed_ms = work.elapsed_ms;
  state.updated_at = work.updated_at;
  state.session_ids = [...work.session_ids];
  state.session_origins = work.session_origins ? { ...work.session_origins } : {};
  state.agent = work.agent;
  state.worktree_path = work.worktree_path;
  state.task_sessions = work.task_sessions ? { ...work.task_sessions } : {};
}
function selectMirrorWork(state) {
  const works = state.works ? Object.values(state.works) : [];
  if (works.length === 0) {
    return null;
  }
  if (state.active_work_id) {
    const matched = works.find((work) => work.work_id === state.active_work_id);
    if (matched) {
      return matched;
    }
  }
  const sorted = [...works].sort((left, right) => {
    const leftMs = parseIsoToMs(left.updated_at ?? left.started_at) ?? 0;
    const rightMs = parseIsoToMs(right.updated_at ?? right.started_at) ?? 0;
    return rightMs - leftMs;
  });
  return sorted[0] ?? null;
}

// vendor/omo-standalone/packages/boulder-state/src/storage/read-state.ts
function readBoulderState(directory) {
  const filePath = getBoulderFilePath(directory);
  if (!existsSync4(filePath)) {
    return null;
  }
  try {
    const content = readFileSync3(filePath, "utf-8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    normalizeState(parsed);
    const state = parsed;
    const mirrorWork = selectMirrorWork(state);
    if (mirrorWork) {
      state.active_work_id = mirrorWork.work_id;
      projectWorkToMirror(state, mirrorWork);
    }
    return state;
  } catch {
    return null;
  }
}
function normalizeState(state) {
  const sessionIds = Array.isArray(state.session_ids) ? state.session_ids : [];
  state.session_ids = sessionIds;
  const sessionOrigins = state.session_origins && typeof state.session_origins === "object" && !Array.isArray(state.session_origins) ? state.session_origins : {};
  state.session_origins = sessionOrigins;
  if (sessionIds.length === 1) {
    const soleSessionId = sessionIds[0];
    if (typeof soleSessionId === "string" && sessionOrigins[soleSessionId] !== "appended" && sessionOrigins[soleSessionId] !== "direct") {
      sessionOrigins[soleSessionId] = "direct";
    }
  }
  if (!state.task_sessions || typeof state.task_sessions !== "object" || Array.isArray(state.task_sessions)) {
    state.task_sessions = {};
  }
}
function getBoulderWorks(state) {
  if (state.works && typeof state.works === "object") {
    return Object.values(state.works);
  }
  if (!state.active_plan || !state.plan_name || !state.started_at) {
    return [];
  }
  return [buildWorkFromMirror(state)];
}
function getActiveWorks(directory) {
  const state = readBoulderState(directory);
  if (!state) {
    return [];
  }
  return getBoulderWorks(state).filter((work) => work.status !== "completed" && work.status !== "abandoned");
}
function getWorkById(directory, workId) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  return getBoulderWorks(state).find((work) => work.work_id === workId) ?? null;
}
function getWorkByPlanName(directory, planName, options) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const worktreePath = options?.worktreePath;
  return getBoulderWorks(state).find((work) => {
    if (work.plan_name !== planName) {
      return false;
    }
    return worktreePath ? work.worktree_path === worktreePath : true;
  }) ?? null;
}
function getWorkForSession(directory, sessionId) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const works = getBoulderWorks(state).filter((work) => work.session_ids.includes(sessionId)).sort((left, right) => (parseIsoToMs(right.updated_at ?? right.started_at) ?? 0) - (parseIsoToMs(left.updated_at ?? left.started_at) ?? 0));
  if (works.length > 0) {
    return works[0] ?? null;
  }
  return state.session_ids.includes(sessionId) ? buildWorkFromMirror(state) : null;
}
function getWorkResumeOptions(directory) {
  const state = readBoulderState(directory);
  if (!state) {
    return [];
  }
  return getBoulderWorks(state).filter((work) => work.status !== "completed" && work.status !== "abandoned").map((work) => {
    const progress = getPlanProgress(resolveBoulderPlanPathForWork(directory, work));
    return {
      work_id: work.work_id,
      plan_name: work.plan_name,
      active_plan: work.active_plan,
      worktree_path: work.worktree_path,
      status: work.status && isValidWorkStatus(work.status) ? work.status : "active",
      started_at: work.started_at,
      updated_at: work.updated_at ?? work.started_at,
      ended_at: work.ended_at,
      elapsed_ms: work.elapsed_ms,
      session_count: work.session_ids.length,
      progress,
      is_current_mirror: state.active_work_id === work.work_id
    };
  });
}
function getTaskSessionState(directory, taskKey) {
  const state = readBoulderState(directory);
  if (state?.active_work_id) {
    const work = state.works?.[state.active_work_id];
    const taskSession = work?.task_sessions?.[taskKey];
    if (taskSession) {
      return taskSession;
    }
  }
  if (!state?.task_sessions) {
    return null;
  }
  return state.task_sessions[taskKey] ?? null;
}
// vendor/omo-standalone/packages/boulder-state/src/storage/write-state.ts
import { existsSync as existsSync5, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname } from "path";
function writeBoulderState(directory, state) {
  const filePath = getBoulderFilePath(directory);
  try {
    const dir = dirname(filePath);
    if (!existsSync5(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const stateToWrite = { ...state };
    if (stateToWrite.works && stateToWrite.active_work_id) {
      const activeWork = stateToWrite.works[stateToWrite.active_work_id];
      if (activeWork) {
        stateToWrite.works = {
          ...stateToWrite.works,
          [stateToWrite.active_work_id]: {
            ...activeWork,
            active_plan: stateToWrite.active_plan,
            plan_name: stateToWrite.plan_name,
            status: stateToWrite.status,
            started_at: stateToWrite.started_at,
            ended_at: stateToWrite.ended_at,
            elapsed_ms: stateToWrite.elapsed_ms,
            updated_at: stateToWrite.updated_at,
            session_ids: [...stateToWrite.session_ids],
            session_origins: stateToWrite.session_origins ? { ...stateToWrite.session_origins } : {},
            agent: stateToWrite.agent,
            worktree_path: stateToWrite.worktree_path,
            task_sessions: stateToWrite.task_sessions ? { ...stateToWrite.task_sessions } : {}
          }
        };
      }
    }
    writeFileSync(filePath, JSON.stringify(stateToWrite, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}
function clearBoulderState(directory) {
  const filePath = getBoulderFilePath(directory);
  try {
    if (existsSync5(filePath)) {
      unlinkSync(filePath);
    }
    return true;
  } catch {
    return false;
  }
}
function generateWorkId(planName) {
  const slug = planName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const randomHex = Math.floor(Math.random() * 4294967295).toString(16).padStart(8, "0");
  return `${slug.length > 0 ? slug : "work"}-${randomHex}`;
}
function createBoulderState(planPath, sessionId, agent, worktreePath) {
  const startedAt = nowIsoString();
  const workId = generateWorkId(getPlanName(planPath));
  const work = {
    work_id: workId,
    active_plan: planPath,
    plan_name: getPlanName(planPath),
    status: "active",
    started_at: startedAt,
    updated_at: startedAt,
    session_ids: [sessionId],
    session_origins: { [sessionId]: "direct" },
    ...agent !== undefined ? { agent } : {},
    ...worktreePath !== undefined ? { worktree_path: worktreePath } : {},
    task_sessions: {}
  };
  return {
    schema_version: 2,
    active_work_id: workId,
    works: { [workId]: work },
    active_plan: planPath,
    started_at: startedAt,
    status: "active",
    updated_at: startedAt,
    session_ids: [sessionId],
    session_origins: { [sessionId]: "direct" },
    plan_name: getPlanName(planPath),
    task_sessions: {},
    ...agent !== undefined ? { agent } : {},
    ...worktreePath !== undefined ? { worktree_path: worktreePath } : {}
  };
}
function selectActiveWork(directory, workId) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const works = getBoulderWorks(state);
  const nextWork = works.find((work) => work.work_id === workId);
  if (!nextWork) {
    return null;
  }
  const nextState = {
    ...state,
    schema_version: 2,
    active_work_id: workId,
    works: state.works ?? Object.fromEntries(works.map((work) => [work.work_id, work]))
  };
  projectWorkToMirror(nextState, nextWork);
  return writeBoulderState(directory, nextState) ? nextState : null;
}
function addBoulderWork(directory, input) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const workId = generateWorkId(getPlanName(input.planPath));
  const startedAt = input.startedAt ?? nowIsoString();
  const nextWork = {
    work_id: workId,
    active_plan: input.planPath,
    plan_name: getPlanName(input.planPath),
    status: "active",
    started_at: startedAt,
    updated_at: startedAt,
    session_ids: [input.sessionId],
    session_origins: { [input.sessionId]: "direct" },
    ...input.agent !== undefined ? { agent: input.agent } : {},
    ...input.worktreePath !== undefined ? { worktree_path: input.worktreePath } : {},
    task_sessions: {}
  };
  const nextState = {
    ...state,
    schema_version: 2,
    works: { ...Object.fromEntries(getBoulderWorks(state).map((work) => [work.work_id, work])), [workId]: nextWork },
    active_work_id: workId
  };
  projectWorkToMirror(nextState, nextWork);
  return writeBoulderState(directory, nextState) ? nextState : null;
}
function completeBoulder(directory, workId, endedAt) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const targetWorkId = workId ?? state.active_work_id;
  if (!targetWorkId) {
    return null;
  }
  const work = state.works?.[targetWorkId] ?? getBoulderWorks(state).find((candidate) => candidate.work_id === targetWorkId);
  if (!work) {
    return null;
  }
  if (work.status === "completed" && work.ended_at !== undefined && work.elapsed_ms !== undefined) {
    return state;
  }
  const endAt = endedAt ?? nowIsoString();
  work.ended_at = endAt;
  work.elapsed_ms = getElapsedMs(work.started_at, endAt);
  work.status = "completed";
  work.updated_at = nowIsoString();
  if (state.active_work_id === targetWorkId) {
    projectWorkToMirror(state, work);
  }
  return writeBoulderState(directory, state) ? state : null;
}

// vendor/omo-standalone/packages/boulder-state/src/storage/session.ts
function appendSessionId(directory, sessionId, origin = "direct") {
  const activeWorkId = readBoulderState(directory)?.active_work_id;
  if (activeWorkId) {
    return appendSessionIdForWork(directory, activeWorkId, sessionId, origin);
  }
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  if (!state.session_origins || typeof state.session_origins !== "object" || Array.isArray(state.session_origins)) {
    state.session_origins = {};
  }
  if (!state.session_ids?.includes(sessionId)) {
    if (!Array.isArray(state.session_ids)) {
      state.session_ids = [];
    }
    const originalSessionIds = [...state.session_ids];
    const originalSessionOrigins = { ...state.session_origins };
    state.session_ids.push(sessionId);
    state.session_origins[sessionId] = origin;
    if (writeBoulderState(directory, state)) {
      return state;
    }
    state.session_ids = originalSessionIds;
    state.session_origins = originalSessionOrigins;
    return null;
  }
  if (!state.session_origins[sessionId]) {
    state.session_origins[sessionId] = origin;
    if (!writeBoulderState(directory, state)) {
      return null;
    }
  }
  return state;
}
function appendSessionIdForWork(directory, workId, sessionId, origin = "direct") {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const works = getBoulderWorks(state);
  const targetWork = works.find((work) => work.work_id === workId);
  if (!targetWork) {
    return null;
  }
  const updatedWork = {
    ...targetWork,
    session_ids: targetWork.session_ids.includes(sessionId) ? [...targetWork.session_ids] : [...targetWork.session_ids, sessionId],
    session_origins: { ...targetWork.session_origins ?? {}, [sessionId]: origin },
    updated_at: nowIsoString()
  };
  const nextState = {
    ...state,
    schema_version: 2,
    works: {
      ...Object.fromEntries(works.map((work) => [work.work_id, work])),
      [workId]: updatedWork
    }
  };
  if (state.active_work_id === workId) {
    projectWorkToMirror(nextState, updatedWork);
  }
  return writeBoulderState(directory, nextState) ? nextState : null;
}
// vendor/omo-standalone/packages/boulder-state/src/storage/task.ts
function upsertTaskSessionState(directory, input) {
  const stateForWork = readBoulderState(directory);
  if (stateForWork?.active_work_id) {
    return upsertTaskSessionStateForWork(directory, stateForWork.active_work_id, input);
  }
  const state = readBoulderState(directory);
  if (!state || RESERVED_KEYS.has(input.taskKey)) {
    return null;
  }
  const taskSessions = state.task_sessions ?? {};
  taskSessions[input.taskKey] = {
    task_key: input.taskKey,
    task_label: input.taskLabel,
    task_title: input.taskTitle,
    session_id: input.sessionId,
    ...input.agent !== undefined ? { agent: input.agent } : {},
    ...input.category !== undefined ? { category: input.category } : {},
    updated_at: nowIsoString()
  };
  state.task_sessions = taskSessions;
  return writeBoulderState(directory, state) ? state : null;
}
function upsertTaskSessionStateForWork(directory, workId, input) {
  if (RESERVED_KEYS.has(input.taskKey)) {
    return null;
  }
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const works = getBoulderWorks(state);
  const targetWork = works.find((work) => work.work_id === workId);
  if (!targetWork) {
    return null;
  }
  const previousTaskSession = targetWork.task_sessions?.[input.taskKey];
  const nextTaskSession = {
    task_key: input.taskKey,
    task_label: input.taskLabel,
    task_title: input.taskTitle,
    session_id: input.sessionId,
    ...input.agent !== undefined ? { agent: input.agent } : {},
    ...input.category !== undefined ? { category: input.category } : {},
    ...previousTaskSession?.started_at !== undefined ? { started_at: previousTaskSession.started_at } : {},
    ...previousTaskSession?.ended_at !== undefined ? { ended_at: previousTaskSession.ended_at } : {},
    ...previousTaskSession?.elapsed_ms !== undefined ? { elapsed_ms: previousTaskSession.elapsed_ms } : {},
    ...previousTaskSession?.status !== undefined ? { status: previousTaskSession.status } : {},
    updated_at: nowIsoString()
  };
  const nextWork = {
    ...targetWork,
    task_sessions: { ...targetWork.task_sessions ?? {}, [input.taskKey]: nextTaskSession },
    updated_at: nowIsoString()
  };
  const nextState = {
    ...state,
    schema_version: 2,
    works: {
      ...Object.fromEntries(works.map((work) => [work.work_id, work])),
      [workId]: nextWork
    }
  };
  if (state.active_work_id === workId) {
    projectWorkToMirror(nextState, nextWork);
  }
  return writeBoulderState(directory, nextState) ? nextState : null;
}
function startTaskTimer(directory, workId, input) {
  const nextState = upsertTaskSessionStateForWork(directory, workId, input);
  if (!nextState) {
    return null;
  }
  const work = nextState.works?.[workId];
  const taskSession = work?.task_sessions?.[input.taskKey];
  if (!work || !taskSession) {
    return null;
  }
  const startedAt = taskSession.started_at ?? input.startedAt ?? nowIsoString();
  taskSession.started_at = startedAt;
  taskSession.status = "running";
  taskSession.updated_at = nowIsoString();
  work.updated_at = nowIsoString();
  return writeBoulderState(directory, nextState) ? nextState : null;
}
function endTaskTimer(directory, workId, taskKey, endedAt) {
  const state = readBoulderState(directory);
  if (!state) {
    return null;
  }
  const work = state.works?.[workId] ?? getBoulderWorks(state).find((candidate) => candidate.work_id === workId);
  if (!work?.task_sessions?.[taskKey]) {
    return null;
  }
  const taskSession = work.task_sessions[taskKey];
  const endAt = endedAt ?? nowIsoString();
  taskSession.ended_at = endAt;
  taskSession.elapsed_ms = getElapsedMs(taskSession.started_at, endAt);
  taskSession.status = "completed";
  taskSession.updated_at = nowIsoString();
  work.updated_at = nowIsoString();
  if (state.active_work_id === workId) {
    projectWorkToMirror(state, work);
  }
  return writeBoulderState(directory, state) ? state : null;
}
export {
  writeBoulderState,
  upsertTaskSessionStateForWork,
  upsertTaskSessionState,
  startTaskTimer,
  selectActiveWork,
  resolveBoulderPlanPathForWork,
  resolveBoulderPlanPath,
  readCurrentTopLevelTask,
  readBoulderState,
  getWorkResumeOptions,
  getWorkForSession,
  getWorkByPlanName,
  getWorkById,
  getTaskSessionState,
  getPlanProgress,
  getPlanName,
  getBoulderWorks,
  getBoulderFilePath,
  getActiveWorks,
  generateWorkId,
  findPrometheusPlans,
  endTaskTimer,
  createBoulderState,
  completeBoulder,
  clearBoulderState,
  appendSessionIdForWork,
  appendSessionId,
  addBoulderWork,
  PROMETHEUS_PLANS_DIR,
  NOTEPAD_DIR,
  NOTEPAD_BASE_PATH,
  BOULDER_STATE_PATH,
  BOULDER_FILE,
  BOULDER_DIR
};
