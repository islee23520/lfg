import { mkdir, readFile, writeFile, readdir, rename, rm, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync, type Stats } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

/**
 * Grok-native team ledger under `.omo/teams`.
 * Zod-validated JSON (fail-closed) + per-team mkdir lock on read-modify-write
 * (mirrors `skills/teammode/scripts/team-state.mjs`). Pure reads stay lock-free.
 */

const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  kind: z.enum(['subagent_type', 'category']),
  subagent_type: z.string().optional(),
  category: z.string().optional(),
  focus: z.string(),
  deliverable: z.string().optional(),
  spawnMetadata: z.record(z.string(), z.unknown()).optional(),
});

const TeamConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  lead: z.object({ kind: z.literal('main-session') }),
  members: z.array(TeamMemberSchema),
  createdAt: z.string(),
  schemaVersion: z.number(),
});

const TeamMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  content: z.string(),
  timestamp: z.string(),
});

const TeamStateSchema = z.object({
  status: z.enum(['active', 'shutdown_requested', 'archived']),
  messages: z.array(TeamMessageSchema),
  lastActivity: z.string(),
  schemaVersion: z.number(),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type TeamMessage = z.infer<typeof TeamMessageSchema>;
export type TeamState = z.infer<typeof TeamStateSchema>;

export interface TeamStatus {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  unreadMessages: number;
  lastActivity: string;
}

const TEAM_SCHEMA_VERSION = 1;

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

async function lstatOrNull(filePath: string): Promise<Stats | null> {
  try {
    return await lstat(filePath);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Read + validate a persisted JSON file through a Zod schema; fail closed on any defect. */
async function readJsonFailClosed<T>(
  filePath: string,
  schema: z.ZodType<T>,
  label: string
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new Error(`${label} unreadable (fails closed): ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} malformed JSON (fails closed): ${filePath}`);
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${label} invalid shape (fails closed): ${filePath}`);
  }
  return result.data;
}

/** Atomic temp+rename write, refusing a symlinked target (defense-in-depth). */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const existing = await lstatOrNull(filePath);
  if (existing?.isSymbolicLink()) {
    throw new Error(`refused: write target is a symlink: ${filePath}`);
  }
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(tmpPath, filePath);
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

function getTeamDir(teamsRoot: string, teamId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error(`Invalid teamId: ${teamId}`);
  }
  return resolve(teamsRoot, teamId);
}

const LOCK_TIMEOUT_MS = Number.parseInt(
  process.env.LFG_TEAM_LOCK_TIMEOUT_MS ?? '10000',
  10
);
const LOCK_RETRY_MS = Number.parseInt(process.env.LFG_TEAM_LOCK_RETRY_MS ?? '25', 10);

/**
 * Serialize a read-modify-write critical section per team dir. The lock is a
 * `.team.lock/` directory created atomically by `mkdir` (EEXIST if held), with an
 * `owner.json` stamp and a symlink guard. Blocks up to LOCK_TIMEOUT_MS, then throws.
 */
async function withTeamLock<T>(
  teamDir: string,
  command: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockDir = join(teamDir, '.team.lock');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let acquired = false;
  for (;;) {
    try {
      await mkdir(lockDir, { mode: 0o700 });
      acquired = true;
      await writeFile(
        join(lockDir, 'owner.json'),
        `${JSON.stringify(
          { pid: process.pid, command, createdAt: new Date().toISOString() },
          null,
          2
        )}\n`,
        { encoding: 'utf8', flag: 'wx' }
      );
      break;
    } catch (err) {
      if (acquired) {
        await rm(lockDir, { recursive: true, force: true }).catch(() => {});
        throw err;
      }
      if (!isErrnoException(err) || err.code !== 'EEXIST') throw err;
      const st = await lstatOrNull(lockDir);
      if (st?.isSymbolicLink()) {
        throw new Error(`refused: team lock path is a symlink: ${lockDir}`);
      }
      if (st && !st.isDirectory()) {
        throw new Error(`refused: team lock path is not a directory: ${lockDir}`);
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `team state is locked (${command}); retry after the current operation completes`
        );
      }
      await delay(Math.min(LOCK_RETRY_MS, Math.max(1, deadline - Date.now())));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function touchStateLastActivity(teamDir: string): Promise<void> {
  const statePath = join(teamDir, 'state.json');
  if (!existsSync(statePath)) return;
  const state = await readJsonFailClosed(statePath, TeamStateSchema, 'Team state');
  state.lastActivity = new Date().toISOString();
  await atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
}

export async function resolveTeamsRoot(cwd: string = process.cwd()): Promise<string> {
  // Project-local ledger only (no ~/.omo/teams fallback in this path).
  const projectTeams = join(cwd, '.omo', 'teams');
  await mkdir(projectTeams, { recursive: true }).catch(() => {});
  return projectTeams;
}

export async function createTeam(
  teamsRoot: string,
  name: string,
  description = ''
): Promise<string> {
  const teamId = `team-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const teamDir = getTeamDir(teamsRoot, teamId);
  await mkdir(teamDir, { recursive: true });
  await mkdir(join(teamDir, 'mailbox'), { recursive: true });
  await mkdir(join(teamDir, 'tasks'), { recursive: true });
  await mkdir(join(teamDir, 'artifacts'), { recursive: true });

  const config: TeamConfig = {
    id: teamId,
    name,
    description,
    lead: { kind: 'main-session' },
    members: [],
    createdAt: new Date().toISOString(),
    schemaVersion: TEAM_SCHEMA_VERSION,
  };

  await atomicWrite(
    join(teamDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n'
  );

  const state: TeamState = {
    status: 'active',
    messages: [],
    lastActivity: new Date().toISOString(),
    schemaVersion: TEAM_SCHEMA_VERSION,
  };

  await atomicWrite(
    join(teamDir, 'state.json'),
    JSON.stringify(state, null, 2) + '\n'
  );

  const guideContent = `# Team ${name} - Grok Native Member Guide

Lead is the main Grok session. Members are launched via spawn_subagent({subagent_type: "...", background: true, description: "...", prompt: "...", team_context: {teamRunId: "${teamId}", memberId: "m01", role: "member"}}).

Use the lfg team-ledger module (src/core/lfg/team-ledger.ts) for state.

State files:
- config.json : team spec and member slots
- state.json : runtime status, messages, tasks
- mailbox/ : per-member inboxes
- guide.md : this file (regenerated on mutate)

See docs/grok-native-team-orchestration.md for full mapping.`;

  await atomicWrite(join(teamDir, 'guide.md'), guideContent);

  return teamId;
}

export async function addMemberSlot(
  teamsRoot: string,
  teamId: string,
  memberSpec: Partial<TeamMember> & { id?: string; focus: string }
): Promise<TeamMember> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const configPath = join(teamDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  return withTeamLock(teamDir, 'add-member', async () => {
    const config = await readJsonFailClosed(configPath, TeamConfigSchema, 'Team config');

    const memberId =
      memberSpec.id || `m${String(config.members.length + 1).padStart(2, '0')}`;
    const newMember: TeamMember = {
      id: memberId,
      kind: memberSpec.kind ?? 'subagent_type',
      focus: memberSpec.focus,
      name: memberSpec.name,
      subagent_type:
        memberSpec.subagent_type ??
        (memberSpec.kind === 'subagent_type' ? 'hephaestus' : undefined),
      category: memberSpec.category,
      deliverable: memberSpec.deliverable,
      spawnMetadata: memberSpec.spawnMetadata,
    };

    if (config.members.some((m) => m.id === newMember.id)) {
      throw new Error(`Member id ${newMember.id} already exists in team ${teamId}`);
    }

    config.members.push(newMember);

    await atomicWrite(configPath, JSON.stringify(config, null, 2) + '\n');
    await touchStateLastActivity(teamDir);

    return newMember;
  });
}

export async function recordSpawnMetadata(
  teamsRoot: string,
  teamId: string,
  memberId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const configPath = join(teamDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  await withTeamLock(teamDir, 'record-spawn', async () => {
    const config = await readJsonFailClosed(configPath, TeamConfigSchema, 'Team config');

    const member = config.members.find((m) => m.id === memberId);
    if (!member) {
      throw new Error(
        `Missing member id ${memberId} in team ${teamId} (fails closed)`
      );
    }

    member.spawnMetadata = {
      ...(member.spawnMetadata ?? {}),
      ...metadata,
      recordedAt: new Date().toISOString(),
    };

    await atomicWrite(configPath, JSON.stringify(config, null, 2) + '\n');
    await touchStateLastActivity(teamDir);
  });
}

export async function appendMessage(
  teamsRoot: string,
  teamId: string,
  from: string,
  to: string,
  content: string
): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const statePath = join(teamDir, 'state.json');
  if (!existsSync(statePath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  await withTeamLock(teamDir, 'append-message', async () => {
    const state = await readJsonFailClosed(statePath, TeamStateSchema, 'Team state');

    const message: TeamMessage = {
      id: randomUUID(),
      from,
      to: to || '*',
      content,
      timestamp: new Date().toISOString(),
    };

    state.messages.push(message);
    state.lastActivity = message.timestamp;

    await atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
  });
}

export async function listTeams(teamsRoot: string): Promise<TeamStatus[]> {
  if (!existsSync(teamsRoot)) {
    return [];
  }
  const entries = await readdir(teamsRoot, { withFileTypes: true });
  const teams: TeamStatus[] = [];

  for (const entry of entries) {
    if (!(entry.isDirectory() && (entry.name.startsWith('team-') || entry.name === 'refactor-squad'))) {
      continue;
    }
    // Skip malformed teams rather than aborting the whole listing (fail-soft for reads).
    try {
      const teamDir = join(teamsRoot, entry.name);
      const configPath = join(teamDir, 'config.json');
      if (!existsSync(configPath)) continue;
      const raw = await readFile(configPath, 'utf8');
      const parsed = TeamConfigSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) continue;
      const config = parsed.data;

      const statePath = join(teamDir, 'state.json');
      let statusData: TeamState = {
        status: 'active',
        messages: [],
        lastActivity: config.createdAt,
        schemaVersion: TEAM_SCHEMA_VERSION,
      };
      if (existsSync(statePath)) {
        const stateRaw = await readFile(statePath, 'utf8');
        const stateParsed = TeamStateSchema.safeParse(JSON.parse(stateRaw));
        if (stateParsed.success) statusData = stateParsed.data;
      }

      teams.push({
        id: config.id,
        name: config.name,
        status: statusData.status,
        memberCount: config.members.length,
        unreadMessages: statusData.messages.length,
        lastActivity: statusData.lastActivity,
      });
    } catch {
      continue;
    }
  }
  return teams.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export async function getStatus(
  teamsRoot: string,
  teamId: string
): Promise<{ config: TeamConfig; state: TeamState; guideExists: boolean }> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const configPath = join(teamDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const config = await readJsonFailClosed(configPath, TeamConfigSchema, 'Team config');

  const statePath = join(teamDir, 'state.json');
  let state: TeamState = {
    status: 'active',
    messages: [],
    lastActivity: config.createdAt,
    schemaVersion: TEAM_SCHEMA_VERSION,
  };
  if (existsSync(statePath)) {
    state = await readJsonFailClosed(statePath, TeamStateSchema, 'Team state');
  }

  return {
    config,
    state,
    guideExists: existsSync(join(teamDir, 'guide.md')),
  };
}

export async function requestShutdown(
  teamsRoot: string,
  teamId: string,
  force = false
): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const statePath = join(teamDir, 'state.json');
  if (!existsSync(statePath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  await withTeamLock(teamDir, 'request-shutdown', async () => {
    const state = await readJsonFailClosed(statePath, TeamStateSchema, 'Team state');

    if (force || state.status !== 'active') {
      state.status = 'archived';
    } else {
      state.status = 'shutdown_requested';
      // In-memory mailbox note (avoid nested appendMessage which would re-lock)
      const shutdownMsg: TeamMessage = {
        id: randomUUID(),
        from: 'lead',
        to: '*',
        content: 'Shutdown requested. Members should ack and stop.',
        timestamp: new Date().toISOString(),
      };
      state.messages.push(shutdownMsg);
    }

    state.lastActivity = new Date().toISOString();
    await atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
  });
}
