import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export type SubagentStopEvidenceResult = {
  readonly hasReceipt: boolean;
  readonly additionalContext?: string;
  readonly warning?: string;
};

export function verifySubagentStopEvidence(payload: unknown, cwd: string = process.cwd()): SubagentStopEvidenceResult {
  try {
    const input = parseSubagentStopInput(payload);
    if (!input) {
      return { hasReceipt: true, additionalContext: 'Not a SubagentStop payload or non-target agent (MVP verifier silent)' };
    }

    const targetGrokAgents = ['coding', 'hephaestus', 'builder'];
    const isTarget = targetGrokAgents.some((agent) => input.agentName.toLowerCase().includes(agent));

    if (!isTarget) {
      return {
        hasReceipt: true,
        additionalContext: `SubagentStop for non-target Grok agent "${input.agentName}" — evidence check skipped (MVP)`,
      };
    }

    const evidenceRoot = resolve(cwd, '.omo', 'evidence');
    const hasReceipt = hasValidEvidenceReceipt(input, evidenceRoot, cwd);

    if (hasReceipt) {
      return {
        hasReceipt: true,
        additionalContext: `Evidence receipt VERIFIED for Grok agent "${input.agentName}" in .omo/evidence (MVP SubagentStop verifier). Continue with next todo or checkpoint.`,
      };
    }

    const warning = renderEvidenceWarning(input.agentName, evidenceRoot);
    return {
      hasReceipt: false,
      warning,
      additionalContext: warning,
    };
  } catch (error) {
    const msg = `Grok SubagentStop evidence verifier: ${error instanceof Error ? error.message : String(error)}`;
    console.error(msg);
    // Fail-closed: in hook context this will surface as error; for pure fn we return structured error
    return {
      hasReceipt: false,
      warning: msg,
      additionalContext: 'ERROR: ' + msg + '\n\nEvidence verifier fail-closed on malformed payload (matches comment-checker pattern). Fix JSON shape before retry.',
    };
  }
}

function parseSubagentStopInput(payload: unknown): { agentName: string; lastMessage?: string; cwd: string } | null {
  let record: Record<string, unknown>;
  if (typeof payload === 'string') {
    try {
      const trimmed = payload.trim();
      if (!trimmed) return null;
      const parsed = JSON.parse(trimmed);
      if (!isRecord(parsed)) return null;
      record = parsed;
    } catch {
      throw new Error('malformed JSON payload');
    }
  } else if (isRecord(payload)) {
    record = payload;
  } else {
    throw new Error('payload must be object or valid JSON string');
  }

  const event = stringField(record, ['hookEventName', 'hook_event_name', 'event', 'type']) ?? '';
  if (!event.toLowerCase().includes('subagentstop') && !event.toLowerCase().includes('stop')) {
    return null;
  }

  const agentName =
    stringField(record, ['agentName', 'agent_name', 'agent', 'subagent.name', 'subagentName', 'subagent_name']) ||
    stringField(record?.subagent ?? {}, ['name', 'type', 'id']) ||
    stringField(record?.result ?? {}, ['agent', 'name']) ||
    'unknown';

  const lastMessage = stringField(record, ['last_assistant_message', 'lastAssistantMessage', 'last_message', 'transcript', 'output', 'result']) ?? '';

  return {
    agentName,
    lastMessage: lastMessage || undefined,
    cwd: stringField(record, ['cwd', 'workspaceRoot', 'workspace_root']) ?? process.cwd(),
  };
}

function hasValidEvidenceReceipt(
  input: { agentName: string; lastMessage?: string; cwd: string },
  evidenceRoot: string,
  cwd: string,
): boolean {
  // MVP: check for any non-empty evidence file in .omo/evidence (upstream looked for EVIDENCE_RECORDED: path)
  // Can be extended with extract from lastMessage like upstream /EVIDENCE_RECORDED:\s*(\S+)/
  if (!existsSync(evidenceRoot)) {
    return false;
  }

  try {
    const files = readdirSync(evidenceRoot);
    for (const file of files) {
      const fullPath = resolve(evidenceRoot, file);
      if (isNonEmptyEvidenceFile(fullPath, evidenceRoot, cwd)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function isNonEmptyEvidenceFile(filePath: string, evidenceRoot: string, cwd: string): boolean {
  if (!existsSync(filePath)) return false;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return false;
    // Avoid symlinks per upstream
    const lstat = lstatSync(filePath, { throwIfNoEntry: false });
    if (lstat?.isSymbolicLink()) return false;

    const relToEvidence = relative(evidenceRoot, filePath);
    const relToCwd = relative(cwd, filePath);
    if (relToEvidence.startsWith('..') || relToCwd.startsWith('..') || isAbsolute(relToEvidence)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function renderEvidenceWarning(agentName: string, evidenceRoot: string): string {
  return (
    `WARNING: Grok SubagentStop evidence verifier (MVP) detected no receipt in ${evidenceRoot} for agent "${agentName}".\n` +
    `Target agents: coding, hephaestus, builder.\n` +
    `Please write concrete evidence (e.g. task-7-*.txt with build/test/output verification) before completion.\n` +
    `This enforces OMO-style evidence discipline in GrokBuild via additionalContext. See .omo/evidence/task-7-lfg-next-release-app-server-epic.txt`
  );
}

function stringField(record: unknown, keys: readonly string[]): string {
  if (!isRecord(record)) return '';
  const rec = record as Record<string, unknown>;
  for (const key of keys) {
    let value = rec[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    // support nested like subagent.name via dot in key or nested object
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      const parentObj = rec[parent];
      if (isRecord(parentObj)) {
        const childVal = (parentObj as Record<string, unknown>)[child];
        if (typeof childVal === 'string' && childVal.length > 0) return childVal;
      }
    }
  }
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
