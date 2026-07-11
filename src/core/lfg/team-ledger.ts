import { mkdir, readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export interface TeamMember {
  id: string;
  name?: string;
  kind: 'subagent_type' | 'category';
  subagent_type?: string;
  category?: string;
  focus: string;
  deliverable?: string;
  spawnMetadata?: Record<string, any>;
}

export interface TeamConfig {
  id: string;
  name: string;
  description?: string;
  lead: { kind: 'main-session' };
  members: TeamMember[];
  createdAt: string;
  schemaVersion: number;
}

export interface TeamMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: string;
}

export interface TeamState {
  status: 'active' | 'shutdown_requested' | 'archived';
  messages: TeamMessage[];
  lastActivity: string;
  schemaVersion: number;
}

export interface TeamStatus {
  id: string;
  name: string;
  status: string;
  memberCount: number;
  unreadMessages: number;
  lastActivity: string;
}

const TEAM_SCHEMA_VERSION = 1;

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: 'utf8', flag: 'wx' });
    await rename(tmpPath, filePath);
  } catch (err) {
    try {
      // best effort cleanup
      await rename(tmpPath, `${tmpPath}.failed`).catch(() => {});
    } catch {}
    throw err;
  }
}

function getTeamDir(teamsRoot: string, teamId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(teamId)) {
    throw new Error(`Invalid teamId: ${teamId}`);
  }
  return resolve(teamsRoot, teamId);
}

export async function resolveTeamsRoot(cwd: string = process.cwd()): Promise<string> {
  // Primary project override wins; falls back to ~/.omo/teams per design doc
  const projectTeams = join(cwd, '.omo', 'teams');
  const homeTeams = join(homedir(), '.omo', 'teams');
  // For MVP, create and prefer project; in production hooks can choose based on context
  await mkdir(projectTeams, { recursive: true }).catch(() => {});
  return projectTeams;
}

export async function createTeam(teamsRoot: string, name: string, description = ''): Promise<string> {
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

  const configStr = await readFile(configPath, 'utf8');
  const config = JSON.parse(configStr) as TeamConfig;

  const memberId = memberSpec.id || `m${String(config.members.length + 1).padStart(2, '0')}`;
  const newMember: TeamMember = {
    id: memberId,
    kind: (memberSpec.kind as any) || 'subagent_type',
    focus: memberSpec.focus,
    name: memberSpec.name,
    subagent_type: memberSpec.subagent_type || (memberSpec.kind === 'subagent_type' ? 'hephaestus' : undefined),
    category: memberSpec.category,
    deliverable: memberSpec.deliverable,
    spawnMetadata: memberSpec.spawnMetadata,
  };

  if (config.members.some((m) => m.id === newMember.id)) {
    throw new Error(`Member id ${newMember.id} already exists in team ${teamId}`);
  }

  config.members.push(newMember);

  await atomicWrite(configPath, JSON.stringify(config, null, 2) + '\n');
  await updateStateLastActivity(teamsRoot, teamId);

  return newMember;
}

async function updateStateLastActivity(teamsRoot: string, teamId: string): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const statePath = join(teamDir, 'state.json');
  if (!existsSync(statePath)) return;

  const stateStr = await readFile(statePath, 'utf8');
  const state = JSON.parse(stateStr) as TeamState;
  state.lastActivity = new Date().toISOString();
  await atomicWrite(statePath, JSON.stringify(state, null, 2) + '\n');
}

export async function recordSpawnMetadata(
  teamsRoot: string,
  teamId: string,
  memberId: string,
  metadata: Record<string, any>
): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const configPath = join(teamDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const configStr = await readFile(configPath, 'utf8');
  const config = JSON.parse(configStr) as TeamConfig;

  const member = config.members.find((m) => m.id === memberId);
  if (!member) {
    throw new Error(`Missing member id ${memberId} in team ${teamId} (fails closed)`);
  }

  member.spawnMetadata = {
    ...(member.spawnMetadata || {}),
    ...metadata,
    recordedAt: new Date().toISOString(),
  };

  await atomicWrite(configPath, JSON.stringify(config, null, 2) + '\n');
  await updateStateLastActivity(teamsRoot, teamId);
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

  const stateStr = await readFile(statePath, 'utf8');
  const state = JSON.parse(stateStr) as TeamState;

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
}

export async function listTeams(teamsRoot: string): Promise<TeamStatus[]> {
  if (!existsSync(teamsRoot)) {
    return [];
  }
  const entries = await readdir(teamsRoot, { withFileTypes: true });
  const teams: TeamStatus[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && (entry.name.startsWith('team-') || entry.name === 'refactor-squad')) {
      try {
        const teamDir = join(teamsRoot, entry.name);
        const configPath = join(teamDir, 'config.json');
        if (existsSync(configPath)) {
          const configStr = await readFile(configPath, 'utf8');
          const config = JSON.parse(configStr) as TeamConfig;
          const statePath = join(teamDir, 'state.json');
          let statusData: Partial<TeamState> = { status: 'active', messages: [], lastActivity: config.createdAt };
          if (existsSync(statePath)) {
            const stateStr = await readFile(statePath, 'utf8');
            statusData = JSON.parse(stateStr);
          }
          teams.push({
            id: config.id,
            name: config.name,
            status: statusData.status || 'active',
            memberCount: config.members.length,
            unreadMessages: statusData.messages?.length || 0,
            lastActivity: statusData.lastActivity || config.createdAt,
          });
        }
      } catch (e) {
        // skip malformed teams
        continue;
      }
    }
  }
  return teams.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export async function getStatus(teamsRoot: string, teamId: string): Promise<{config: TeamConfig; state: TeamState; guideExists: boolean}> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const configPath = join(teamDir, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const configStr = await readFile(configPath, 'utf8');
  const config = JSON.parse(configStr) as TeamConfig;

  const statePath = join(teamDir, 'state.json');
  let state: TeamState = {
    status: 'active',
    messages: [],
    lastActivity: config.createdAt,
    schemaVersion: TEAM_SCHEMA_VERSION,
  };
  if (existsSync(statePath)) {
    const stateStr = await readFile(statePath, 'utf8');
    state = { ...state, ...JSON.parse(stateStr) };
  }

  return {
    config,
    state,
    guideExists: existsSync(join(teamDir, 'guide.md')),
  };
}

export async function requestShutdown(teamsRoot: string, teamId: string, force = false): Promise<void> {
  const teamDir = getTeamDir(teamsRoot, teamId);
  const statePath = join(teamDir, 'state.json');
  if (!existsSync(statePath)) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const stateStr = await readFile(statePath, 'utf8');
  const state = JSON.parse(stateStr) as TeamState;

  if (force || state.status !== 'active') {
    state.status = 'archived';
  } else {
    state.status = 'shutdown_requested';
    // In-memory mailbox note (avoid nested appendMessage which would race this write)
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
}

// For tests and CLI use
export async function cleanupTestTeam(teamsRoot: string, teamId: string): Promise<void> {
  // not implemented for safety; tests should use tmp dirs
}
