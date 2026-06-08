#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
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
const gap = evaluatePublishGap({
  packageName: local.name,
  localVersion: local.version,
  registryVersion: registry,
  hasBin: isPublishedLfgBinTarget(local.bin?.lfg),
})
const outDir = `${root}/.omo/ulw-loop/evidence`
await mkdir(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const path = `${outDir}/publish-gap-${stamp}.json`
const payload = { ...gap, bin: local.bin ?? null, registryBin }
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, evidencePath: path }))