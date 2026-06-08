#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { evaluateNpmPublishAuth } from "../plugins/lfg/dist/npm-publish-auth.js"
import { isPublishedLfgBinTarget } from "../plugins/lfg/dist/npm-publish-bin.js"
import { evaluatePublishGap } from "../plugins/lfg/dist/publish-readiness.js"
import { parseNpmRegistryVersion } from "../plugins/lfg/dist/npm-registry-version.js"
import { parseNpmRegistryBinLfg, registryBinPublishContract } from "../plugins/lfg/dist/npm-registry-bin.js"

const root = new URL("..", import.meta.url).pathname
const local = JSON.parse(readFileSync(`${root}/package.json`, "utf8"))
let registry = "unavailable"
try {
  const raw = execFileSync("npm", ["view", local.name, "version"], { encoding: "utf8" })
  registry = parseNpmRegistryVersion(raw) ?? "unavailable"
} catch {
  registry = "unavailable"
}
let registryBinLfg = null
try {
  const rawBin = execFileSync("npm", ["view", local.name, "bin.lfg"], { encoding: "utf8" })
  registryBinLfg = parseNpmRegistryBinLfg(rawBin)
} catch {
  registryBinLfg = null
}
const registryBin = registryBinPublishContract(registryBinLfg)
let npmUser = null
try {
  npmUser = execFileSync("npm", ["whoami"], { encoding: "utf8" }).trim()
} catch {
  npmUser = null
}
const gap = evaluatePublishGap({
  packageName: local.name,
  localVersion: local.version,
  registryVersion: registry,
  hasBin: isPublishedLfgBinTarget(local.bin?.lfg),
})
const auth = evaluateNpmPublishAuth(npmUser)
const ready = gap.publishReady && auth.ok
const payload = { ready, gap, auth, registryBin }
console.log(JSON.stringify(payload, null, 2))
process.exit(ready ? 0 : 2)