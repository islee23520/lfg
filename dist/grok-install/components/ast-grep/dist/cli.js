#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { argv, execPath, stderr } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = argv.slice(2);
const sub = args[0] || '';
const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '..', '..', '..');

function forward(realCmd) {
  const child = spawn(execPath, realCmd, { stdio: 'inherit' });
  child.on('error', (e) => { stderr.write(String(e) + '\n'); process.exit(1); });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (sub === 'mcp' || sub === '') {
  forward([join(pluginRoot, 'mcp-runtimes', 'ast-grep-mcp', 'dist', 'cli.js'), 'mcp']);
} else if (sub === 'hook') {
  // ast-grep tools are deferred until a real Grok-adapted runtime is packaged.
  // Exit 0 silently so the hook bridge treats this as a no-op, not an error.
  process.exit(0);
} else {
  stderr.write('lfg ast-grep shim: unknown subcommand ' + sub + '\n');
  process.exit(2);
}
