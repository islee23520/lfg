import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { verifySubagentStopEvidence } from './subagent-stop-evidence-verifier';

describe('subagent-stop-evidence-verifier (Grok MVP for checkbox 7)', () => {
  let tempDir: string;
  let evidenceDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'lfg-evidence-verifier-test-'));
    evidenceDir = join(tempDir, '.omo', 'evidence');
    await mkdir(evidenceDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('fail-closed on malformed JSON string', () => {
    const result = verifySubagentStopEvidence('invalid json {');
    expect(result.hasReceipt).toBe(false);
    expect(result.additionalContext).toContain('malformed JSON payload');
    expect(result.warning).toContain('malformed JSON');
  });

  test('fail-closed on non-object payload', () => {
    const result = verifySubagentStopEvidence(null);
    expect(result.hasReceipt).toBe(false);
    expect(result.additionalContext).toContain('payload must be object');
  });

  test('silent for non-SubagentStop event', () => {
    const payload = { hookEventName: 'PostToolUse', agentName: 'coding' };
    const result = verifySubagentStopEvidence(payload, tempDir);
    expect(result.hasReceipt).toBe(true);
    expect(result.additionalContext).toContain('Not a SubagentStop payload');
  });

  test('non-target agent (e.g. sisyphus) returns success without check', () => {
    const payload = {
      hookEventName: 'SubagentStop',
      agentName: 'sisyphus',
    };
    const result = verifySubagentStopEvidence(payload, tempDir);
    expect(result.hasReceipt).toBe(true);
    expect(result.additionalContext).toContain('non-target Grok agent "sisyphus"');
  });

  test('target agent without evidence dir returns warning via additionalContext', () => {
    const payload = {
      hookEventName: 'SubagentStop',
      agent: 'hephaestus',
      last_assistant_message: 'Completed task without evidence.',
    };
    const result = verifySubagentStopEvidence(payload, tempDir);
    expect(result.hasReceipt).toBe(false);
    expect(result.warning || result.additionalContext || '').toContain('no receipt in');
    expect(result.additionalContext).toContain('WARNING: Grok SubagentStop evidence verifier (MVP)');
    expect(result.additionalContext).toContain('hephaestus');
  });

  test('target agent with valid evidence file returns verified success', async () => {
    await writeFile(join(evidenceDir, 'task-7-lfg-next-release-app-server-epic.txt'), 'Concrete evidence: build passed, tests green, parity updated.\n', 'utf8');

    const payload = {
      hookEventName: 'SubagentStop',
      subagent: { name: 'coding-agent' },
      cwd: tempDir,
    };
    const result = verifySubagentStopEvidence(payload, tempDir);
    expect(result.hasReceipt).toBe(true);
    expect(result.additionalContext).toContain('Evidence receipt VERIFIED for Grok agent "coding-agent"');
    expect(result.additionalContext).toContain('MVP SubagentStop verifier');
  });

  test('extracts agent name from multiple possible Grok payload shapes', () => {
    const shapes = [
      { hookEventName: 'SubagentStop', agentName: 'builder' },
      { hookEventName: 'subagent-stop', subagent: { name: 'Hephaestus' } },
      { event: 'SubagentStop', subagent: { name: 'Coding' } },
      { hook_event_name: 'SubagentStop', result: { agent: 'builder-v2' } },
    ];

    for (const shape of shapes) {
      const result = verifySubagentStopEvidence(shape, tempDir);
      expect(result.additionalContext || '').toMatch(/builder|Hephaestus|Coding|builder-v2/);
    }
  });
});
