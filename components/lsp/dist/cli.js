#!/usr/bin/env node
// ESM shim (the source tree is "type": "module").
// Forwards "mcp" (and hooks) to the real working copies in ~/.grok/installed-plugins/lfg.
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
  // The working lsp daemon (provides the real lsp.* tools)
  forward(['/Users/ilseoblee/.grok/installed-plugins/lfg/node_modules/@code-yeongyu/lsp-daemon/dist/cli.js', 'mcp']);
} else if (sub === 'hook') {
  // Delegate hooks to the installed component's cli
  forward(['/Users/ilseoblee/.grok/installed-plugins/lfg/components/lsp/dist/cli.js', ...args]);
} else {
  stderr.write('lfg lsp shim: unknown subcommand ' + sub + '\n');
  process.exit(2);
}
