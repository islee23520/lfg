#!/usr/bin/env node
import { execFileSync } from "node:child_process"

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
  "plugins/lfg/lfg",
  "plugins/lfg/dist/lfg.js",
  "plugins/lfg/dist/publish-readiness.js",
  "plugins/lfg/dist/npm-publish-auth.js",
  "plugins/lfg/dist/npm-registry-version.js",
]
const missing = required.filter((p) => !paths.includes(p))
if (missing.length > 0) {
  console.error("assert-npm-pack-bin: missing paths:", missing.join(", "))
  process.exit(1)
}
const rootPkg = JSON.parse(
  execFileSync("node", ["-e", "console.log(JSON.stringify(require('./package.json')))"], { encoding: "utf8" }),
)
if (!rootPkg.bin?.lfg) {
  console.error("assert-npm-pack-bin: root package.json missing bin.lfg")
  process.exit(1)
}
console.log(`assert-npm-pack-bin: ok @${rootPkg.version} (${pack.filename})`)