#!/usr/bin/env node
// ESM shim for source tree (when Grok resolves lfg plugin to the workspace checkout).
// Forwards to the real working copy in the installed-plugins tree.
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
  forward(['/Users/ilseoblee/.grok/plugins/lfg/mcp-runtimes/git-bash-mcp/dist/cli.js', 'mcp']);
} else if (sub === 'hook') {
  forward(['/Users/ilseoblee/.grok/plugins/lfg/mcp-runtimes/git-bash-mcp/dist/cli.js', ...args]);
} else {
  stderr.write('lfg git-bash shim: unknown subcommand ' + sub + '\n');
  process.exit(2);
}
