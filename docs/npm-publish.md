# Publish `@islee23520/lfg` (closes #22)

Publish **from repository root** — not `plugins/lfg` alone.

```sh
npm login
npm test
npm publish --access public
```

Verify from a clean directory:

```sh
mkdir /tmp/lfg-smoke && cd /tmp/lfg-smoke && npm init -y
npm install @islee23520/lfg@latest
npx lfg --json doctor
```

Expected: `bin` resolves to `plugins/lfg/lfg` → `dist/lfg.js`; doctor `cli.ok: true` when `~/.grok` has stamp after `setup --run`.