# Publish `@islee23520/lfg` (automated, tag-driven)

Publish **from repository root** — not `src` alone. A broken publish shipped hundreds of workspace files (`fileCount` ~505 on early registry builds); root `files` allowlist keeps the tarball small (`npm-pack-contract.test.ts`).

Root `package.json` must expose `"bin": { "lfg": "bin/lfg.js" }` (shell shim → `dist/lfg.js`). There is no nested workspace publish surface; `npm run assert-pack` and `node scripts/pre-publish-check.mjs` reject other `bin.lfg` targets (e.g. `dist/lfg.js` only). The `prepack` lifecycle (`prepack` → `npm run build`) regenerates `dist/`, so the published tarball always matches source.

## Automated release (primary)

A `v*` git tag push triggers `.github/workflows/lfg.yml`:

1. **verify** job — `npm ci` → `npm run verify` (assert-pack + OMO parity + test + typecheck + self-test).
2. **publish** job — runs only on pushed `refs/tags/v*`, after `verify`: package/lockfile version guard → `npm publish --access public` → **GitHub Release** (auto-generated notes).

Release locally:

```sh
npm version patch      # bumps package.json + package-lock.json, commits, tags vX.Y.Z
git push && git push --follow-tags
```

The publish job's version guard fails the run unless `package.json`, `package-lock.json`, and the lockfile root package version equal the tag (`GITHUB_REF_NAME` minus the `v`), so a tag pushed without a complete version bump cannot publish. The npm publish lifecycle (`prepublishOnly` → `prepack`) runs the full `npm run verify` gate, then rebuilds `dist/` as a final safety belt.

Required secret: GitHub repo secret `NPM_TOKEN` (npm access token, Automation/Granular recommended, scoped to `@islee23520/lfg` publish). If the npm account enforces 2FA on publish, the token must be Automation/Granular so the unattended publish succeeds.

## Local pre-flight (optional, before tagging)

```sh
npm run build
node scripts/record-publish-gap.mjs      # local vs registry version + registryBin gap
node scripts/pre-publish-check.mjs       # gap + auth + registryBin JSON; exit 0 only when ready
node scripts/assert-npm-publish-auth.mjs # exit 0 when logged in; exit 2 + JSON when not
```

`scripts/record-publish-gap.mjs` and `scripts/pre-publish-check.mjs` include `registryBin` (live npm `bin.lfg` vs publish contract). `npm run assert-pack` runs `npm pack --dry-run` (triggers `prepack` → `npm run build`) then checks root `bin.lfg` and required dist paths.

## Manual fallback (if CI publish is unavailable)

```sh
npm login
npm run verify
npm publish --access public   # must ship 0.1.4+ with bin/lfg.js
```

`npm run verify` = assert-pack + OMO parity + test + typecheck + self-test.

## Post-publish smoke

Verify from a clean directory:

```sh
mkdir /tmp/lfg-smoke && cd /tmp/lfg-smoke && npm init -y
npm install @islee23520/lfg@latest
npx @islee23520/lfg --json setup
```

Expected: `bin` resolves to `bin/lfg.js` → `dist/lfg.js`; setup returns a non-mutating JSON plan unless `setup --run` is explicit.

## Legacy registry notes

`@0.1.1` on npm has **no** `bin` — `npx @islee23520/lfg` fails with *could not determine executable* (`registry-install-smoke.integration.test.ts`).

Registry `0.1.3` uses legacy `bin.lfg: dist/lfg.js` and does **not** ship the `bin/lfg.js` shell shim (0.1.4+ pack does); republish `0.1.4+` with `bin/lfg.js` is required for the stable setup bin contract (`registry-install-smoke.integration.test.ts`).

`closes #22`.
