#!/usr/bin/env node
// ESM shim for when Grok resolves lfg to the source workspace.
// Forwards to the real working ast-grep-mcp in the installed-plugins tree.
import { spawn } from 'node:child_process';
import { argv, execPath, stderr } from 'node:process';

const args = argv.slice(2);
const sub = args[0] || '';

function forward(realCmd) {
  const child = spawn(execPath, realCmd, { stdio: 'inherit' });
  child.on('error', (e) => { stderr.write(String(e) + '\n'); process.exit(1); });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (sub === 'mcp' || sub === '') {
  forward(['/Users/ilseoblee/.grok/plugins/lfg/mcp-runtimes/ast-grep-mcp/dist/cli.js', 'mcp']);
} else if (sub === 'hook') {
  forward(['/Users/ilseoblee/.grok/plugins/lfg/components/ast-grep/dist/cli.js', ...args]);
} else {
  stderr.write('lfg ast-grep shim: unknown subcommand ' + sub + '\n');
  process.exit(2);
}
