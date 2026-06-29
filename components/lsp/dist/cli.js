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
  forward([join(pluginRoot, 'mcp-runtimes', 'lsp-daemon', 'dist', 'cli.js'), 'mcp']);
} else if (sub === 'hook') {
  process.exit(0);
} else {
  stderr.write('lfg lsp shim: unknown subcommand ' + sub + '\n');
  process.exit(2);
}
