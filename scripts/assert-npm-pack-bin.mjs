#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { isPublishedLfgBinTarget, PUBLISHED_LFG_BIN_TARGET } from "../plugins/lfg/dist/npm-publish-bin.js"

const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" })
const packs = JSON.parse(raw)
const pack = packs[0]
if (!pack?.files?.length) {
  console.error("assert-npm-pack-bin: no files in pack")
  process.exit(1)
}
const paths = pack.files.map((f) => f.path)
const required = [
  "package.json",
  PUBLISHED_LFG_BIN_TARGET,
  "plugins/lfg/dist/lfg.js",
  "plugins/lfg/dist/self-test.js",
  "plugins/lfg/dist/publish-readiness.js",
  "plugins/lfg/dist/npm-publish-auth.js",
  "plugins/lfg/dist/npm-registry-version.js",
  "plugins/lfg/dist/npm-publish-bin.js",
  "plugins/lfg/dist/npm-registry-bin.js",
  "plugins/lfg/dist/grok-install/fixture-minimal/hooks/hooks.json",
  // Grok-first OMO parity requires native Grok hook fixtures plus bridge fallback assets.
  "plugins/lfg/dist/grok-install/assets/lfg-grok-hook-bridge.mjs",
  "plugins/lfg/dist/grok-install/assets/lfg-config-loader.mjs",
]
const requiredSkillFragments = ["ulw"]
const missing = required.filter((p) => !paths.includes(p))
const missingSkillFragments = requiredSkillFragments.filter(
  (fragment) => !paths.some((path) => path.startsWith("plugins/lfg/skills/") && path.includes(fragment)),
)
if (missing.length > 0 || missingSkillFragments.length > 0) {
  console.error("assert-npm-pack-bin: missing paths:", missing.concat(missingSkillFragments).join(", "))
  process.exit(1)
}
const staleBuildPaths = paths.filter((p) => p.includes("/fixture-minimal.build-"))
if (staleBuildPaths.length > 0) {
  console.error("assert-npm-pack-bin: stale build temp paths:", staleBuildPaths.join(", "))
  process.exit(1)
}
const rootPkg = JSON.parse(
  execFileSync("node", ["-e", "console.log(JSON.stringify(require('./package.json')))"], { encoding: "utf8" }),
)
const binLfg = rootPkg.bin?.lfg
if (!binLfg) {
  console.error("assert-npm-pack-bin: root package.json missing bin.lfg")
  process.exit(1)
}
if (!isPublishedLfgBinTarget(binLfg)) {
  console.error(`assert-npm-pack-bin: bin.lfg must be ${PUBLISHED_LFG_BIN_TARGET} (got ${JSON.stringify(binLfg)})`)
  process.exit(1)
}
console.log(`assert-npm-pack-bin: ok @${rootPkg.version} (${pack.filename})`)