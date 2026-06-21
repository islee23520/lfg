import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function inspectProjectOmoLedger(options) {
  const boulderPath = join(options.projectRoot, ".omo", "boulder.json");
  const ledgerPath = join(options.projectRoot, ".omo", "start-work", "ledger.jsonl");
  const base = { projectRoot: options.projectRoot, boulderPath, ledgerPath };
  const raw = await readOptionalText(boulderPath);
  if (raw === null) {
    const ulwLoop = await inspectUlwLoop(options.projectRoot) ?? emptyUlwLoop();
    return { ...base, status: "absent", work: null, ledgerExists: false, ledgerLineCount: 0, matchedBy: null, ulwLoop, resumeOptions: [], ledgerPreviews: [] };
  }
  const state = parseBoulderState(raw);
  if (state === null) {
    const ulwLoop = await inspectUlwLoop(options.projectRoot) ?? emptyUlwLoop();
    return { ...base, status: "malformed", work: null, ledgerExists: false, ledgerLineCount: 0, matchedBy: null, ulwLoop, resumeOptions: [], ledgerPreviews: [] };
  }
  const match = findWork(state, options.sessionId);
  const ledger = await inspectLedger(ledgerPath);
  const ulwLoop = await inspectUlwLoop(options.projectRoot);
  return {
    ...base,
    status: "present",
    work: match?.work ?? null,
    ledgerExists: ledger.exists,
    ledgerLineCount: ledger.lineCount,
    matchedBy: match?.matchedBy ?? null,
    ulwLoop,
    resumeOptions: resumeOptionsFromState(state),
    ledgerPreviews: ledgerPreviews(ledger, ulwLoop),
  };
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseBoulderState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const activeWorkId = stringField(parsed, "active_work_id") ?? stringField(parsed, "activeWorkId");
    const works = isRecord(parsed.works) ? parseWorksMap(parsed.works) : parseLegacySingleWork(parsed);
    return works.size > 0 ? { activeWorkId, works } : null;
  } catch {
    return null;
  }
}

function parseWorksMap(worksValue) {
  const works = new Map();
  for (const [key, value] of Object.entries(worksValue)) {
    const work = parseWork(key, value);
    if (work !== null) works.set(work.workId, work);
  }
  return works;
}

function parseLegacySingleWork(value) {
  const work = parseWork("active", value);
  return work === null ? new Map() : new Map([[work.workId, work]]);
}

function parseWork(fallbackId, value) {
  if (!isRecord(value)) return null;
  const workId = stringField(value, "work_id") ?? stringField(value, "workId") ?? fallbackId;
  const planName = stringField(value, "plan_name") ?? stringField(value, "planName") ?? workId;
  const status = stringField(value, "status") ?? "unknown";
  const activePlan = stringField(value, "active_plan") ?? stringField(value, "activePlan") ?? "";
  const worktreePath = nullableStringField(value, "worktree_path") ?? nullableStringField(value, "worktreePath");
  const rawSessionIds = Array.isArray(value.session_ids) ? value.session_ids : Array.isArray(value.sessionIds) ? value.sessionIds : [];
  const sessionIds = rawSessionIds.filter((entry) => typeof entry === "string" && entry.length > 0);
  return { workId, planName, status, activePlan, worktreePath, sessionIds };
}

function findWork(state, sessionId) {
  const sessionMatches = sessionId !== null ? [
    { session: `grok:${sessionId}`, matchedBy: "grok-session" },
    { session: `codex:${sessionId}`, matchedBy: "codex-session" },
    { session: `opencode:${sessionId}`, matchedBy: "opencode-session" },
    { session: sessionId, matchedBy: "raw-session" },
  ] : [];
  for (const candidate of sessionMatches) {
    for (const work of state.works.values()) {
      if (work.sessionIds.includes(candidate.session)) return { work: publicWork(work), matchedBy: candidate.matchedBy };
    }
  }
  if (state.activeWorkId !== null) {
    const active = state.works.get(state.activeWorkId);
    if (active !== undefined) return { work: publicWork(active), matchedBy: "active-work-id" };
  }
  return null;
}

function publicWork(work) {
  return {
    workId: work.workId,
    planName: work.planName,
    status: work.status,
    activePlan: work.activePlan,
    worktreePath: work.worktreePath,
  };
}

async function inspectLedger(path) {
  try {
    await access(path);
    const text = await readFile(path, "utf8");
    return { exists: true, lineCount: text.split("\n").filter((line) => line.length > 0).length, truncated: false };
  } catch {
    return { exists: false, lineCount: 0, truncated: false };
  }
}

function resumeOptionsFromState(state) {
  return [...state.works.values()].map((work) => ({
    workId: work.workId,
    planName: work.planName,
    status: work.status,
    activePlan: work.activePlan,
    worktreePath: work.worktreePath,
    sessionCount: work.sessionIds.length,
    awarenessOnly: true,
  }));
}

function ledgerPreviews(ledger, ulwLoop) {
  const previews = [];
  if (ledger.exists) {
    previews.push({ source: "start-work", sessionId: null, lineCount: ledger.lineCount, truncated: ledger.truncated });
  }
  previews.push(...(ulwLoop?.ledgerPreviews ?? []));
  return previews;
}

function emptyUlwLoop() {
  return { present: false, sessionCount: 0, hasActiveLedger: false, ledgerPreviews: [] };
}

async function inspectUlwLoop(projectRoot) {
  const loopRoot = join(projectRoot, ".omo", "ulw-loop");
  try {
    const entries = await readdir(loopRoot, { withFileTypes: true });
    const sessions = entries.filter((e) => e.isDirectory() && /^[0-9a-f-]{8,}$/i.test(e.name));
    if (sessions.length === 0) {
      return emptyUlwLoop();
    }
    let hasActiveLedger = false;
    const ledgerPreviews = [];
    for (const s of sessions) {
      const ledgerPath = join(loopRoot, s.name, "ledger.jsonl");
      const preview = await inspectLedger(ledgerPath);
      if (preview.exists && preview.lineCount > 0) {
        hasActiveLedger = true;
        ledgerPreviews.push({ source: "ulw-loop", sessionId: s.name, lineCount: preview.lineCount, truncated: preview.truncated });
      }
    }
    return { present: true, sessionCount: sessions.length, hasActiveLedger, ledgerPreviews };
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record, key) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function nullableStringField(record, key) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
