#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { readFileSync } from "node:fs"

const root = new URL("..", import.meta.url).pathname
const local = JSON.parse(readFileSync(`${root}/package.json`, "utf8"))
let registry = "unknown"
try {
  registry = execFileSync("npm", ["view", local.name, "version"], { encoding: "utf8" }).trim()
} catch {
  registry = "unavailable"
}
const outDir = `${root}/.omo/ulw-loop/evidence`
await mkdir(outDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const path = `${outDir}/publish-gap-${stamp}.json`
const payload = {
  package: local.name,
  localVersion: local.version,
  registryVersion: registry,
  publishReady: local.version !== registry && Boolean(local.bin?.lfg),
  bin: local.bin ?? null,
}
await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ ...payload, evidencePath: path }))