# Publish `@islee23520/lfg` (closes #22)

Publish **from repository root** — not `plugins/lfg` alone.

```sh
npm run pre-publish-check     # gap + auth JSON; exit 0 only when both ready (#22)
npm run assert-publish-auth   # exit 0 when logged in; exit 2 + JSON when not (#22)
npm login
npm run verify
npm publish --access public
```

`npm run verify` = assert-pack + test + typecheck + self-test.

Verify from a clean directory:

```sh
mkdir /tmp/lfg-smoke && cd /tmp/lfg-smoke && npm init -y
npm install @islee23520/lfg@latest
npx lfg --json doctor
```

Expected: `bin` resolves to `plugins/lfg/lfg` → `dist/lfg.js`; doctor `cli.ok: true` when `~/.grok` has stamp after `setup --run`.