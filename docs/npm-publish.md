# Publish `@islee23520/lfg` (closes #22)

Publish **from repository root** — not `plugins/lfg` alone.

Root `package.json` must expose `"bin": { "lfg": "plugins/lfg/lfg" }` (shell shim → `dist/lfg.js`). `npm run assert-pack` and `npm run pre-publish-check` reject other `bin.lfg` targets (e.g. `dist/lfg.js` only).

```sh
npm run record-publish-gap    # gap + registryBin (live npm bin.lfg) → .omo/ulw-loop/evidence/publish-gap-*.json (#22)
npm run pre-publish-check     # gap + auth + registryBin JSON; exit 0 only when both ready (#22)
npm run assert-publish-auth   # exit 0 when logged in; exit 2 + JSON when not (#22)
npm login
npm run verify
npm publish --access public   # must ship 0.1.4+ with `plugins/lfg/lfg` (registry latest before publish is 0.1.3 legacy bin)
```

`npm run verify` = assert-pack + test + typecheck + self-test.

`npm run record-publish-gap` and `npm run pre-publish-check` include `registryBin` (live npm `bin.lfg` vs publish contract).

`npm run assert-pack` runs `npm pack --dry-run` (triggers `prepack` → `npm run build`) then checks root `bin.lfg` and required dist paths.

After publish, set `LFG_DOCTOR_REGISTRY_VERSION` to the registry version when checking publish gap locally:

```sh
LFG_DOCTOR_REGISTRY_VERSION=$(npm view @islee23520/lfg version) npx lfg --json doctor
```

Verify from a clean directory:

```sh
mkdir /tmp/lfg-smoke && cd /tmp/lfg-smoke && npm init -y
npm install @islee23520/lfg@latest
npx @islee23520/lfg --json doctor
```

Expected: `bin` resolves to `plugins/lfg/lfg` → `dist/lfg.js`; doctor `cli.ok: true` when `~/.grok` has stamp after `setup --run`.

`@0.1.1` on npm has **no** `bin` — `npx @islee23520/lfg` fails with *could not determine executable* (`registry-install-smoke.integration.test.ts`).

Registry `0.1.3` uses legacy `bin.lfg: plugins/lfg/dist/lfg.js`; `npx @islee23520/lfg` runs but republish `0.1.4+` with `plugins/lfg/lfg` is required for full doctor `cli` / `publishGap` parity (`registry-install-smoke.integration.test.ts`).

`lfg --json doctor` with `LFG_DOCTOR_REGISTRY_VERSION` includes `publishGap`; broken npm layouts (missing or wrong `bin.lfg`) set `cli.ok: false` and `publishGap.publishReady: false`.