# Publish `@islee23520/lfg` (closes #22)

Publish **from repository root** — not `src` alone. A broken publish shipped hundreds of workspace files (`fileCount` ~505 on early registry builds); root `files` allowlist keeps the tarball small (`npm-pack-contract.test.ts`).

Root `package.json` must expose `"bin": { "lfg": "bin/lfg.js" }` (shell shim → `dist/lfg.js`). The package has no nested workspace publish surface; `npm run assert-pack` and `npm run pre-publish-check` reject other `bin.lfg` targets (e.g. `dist/lfg.js` only).

```sh
npm run record-publish-gap    # gap + registryBin (live npm bin.lfg) → .omo/ulw-loop/evidence/publish-gap-*.json (#22)
npm run pre-publish-check     # gap + auth + registryBin JSON; exit 0 only when both ready (#22)
npm run assert-publish-auth   # exit 0 when logged in; exit 2 + JSON when not (#22)
npm login
npm run verify
npm publish --access public   # must ship 0.1.4+ with `bin/lfg.js` (registry latest before publish is 0.1.3 legacy bin)
```

`npm run verify` = assert-pack + test + typecheck + self-test.

`npm run record-publish-gap` and `npm run pre-publish-check` include `registryBin` (live npm `bin.lfg` vs publish contract).

`npm run assert-pack` runs `npm pack --dry-run` (triggers `prepack` → `npm run build`) then checks root `bin.lfg` and required dist paths.

Verify from a clean directory:

```sh
mkdir /tmp/lfg-smoke && cd /tmp/lfg-smoke && npm init -y
npm install @islee23520/lfg@latest
npx @islee23520/lfg --json setup
```

Expected: `bin` resolves to `bin/lfg.js` → `dist/lfg.js`; setup returns a non-mutating JSON plan unless `setup --run` is explicit.

`@0.1.1` on npm has **no** `bin` — `npx @islee23520/lfg` fails with *could not determine executable* (`registry-install-smoke.integration.test.ts`).

Registry `0.1.3` uses legacy `bin.lfg: dist/lfg.js` and does **not** ship the `bin/lfg.js` shell shim (0.1.4+ pack does); republish `0.1.4+` with `bin/lfg.js` is required for the stable setup bin contract (`registry-install-smoke.integration.test.ts`).
