#!/usr/bin/env bun
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(__dirname, "..")
const vendorLinks = join(pluginRoot, "vendor-links")
const omoPackages = join(pluginRoot, "vendor", "omo-standalone", "packages")

const PACKAGES = [
  "adapter-codex", "adapter-opencode", "agents-md-core", "ast-grep-core",
  "boulder-state", "comment-checker-core", "hooks-core", "model-core",
  "rules-engine", "skills-core", "standalone-runtime", "ulw-host-contract",
  "ulw-intent", "ulw-kernel", "ulw-loop-state", "utils",
]

let built = 0
let failed = 0

for (const pkg of PACKAGES) {
  const srcDir = join(omoPackages, pkg)
  const srcEntry = join(srcDir, "src", "index.ts")
  const distDir = join(srcDir, "dist")
  const distFile = join(distDir, "index.js")
  const linkDir = join(vendorLinks, pkg)
  const linkDist = join(linkDir, "dist")
  const linkDistFile = join(linkDist, "index.js")

  if (!existsSync(srcEntry)) {
    console.error(`SKIP ${pkg}: no src/index.ts`)
    failed++
    continue
  }

  mkdirSync(distDir, { recursive: true })

  const externals = ["@oh-my-opencode/*"]
  const proc = Bun.spawnSync([
    "bun", "build", srcEntry,
    "--outdir", distDir,
    "--target", "bun",
    "--format", "esm",
    ...externals.flatMap((e) => ["--external", e]),
  ], { stdout: "pipe", stderr: "pipe" })

  if (proc.exitCode !== 0) {
    console.error(`FAIL ${pkg}: build exited ${proc.exitCode}`)
    console.error(proc.stderr.toString())
    failed++
    continue
  }

  mkdirSync(linkDist, { recursive: true })
  copyFileSync(distFile, linkDistFile)

  const linkPkg = join(linkDir, "package.json")
  if (!existsSync(linkPkg)) {
    writeFileSync(linkPkg, JSON.stringify({
      name: `@oh-my-opencode/${pkg}`,
      version: "0.1.0",
      private: true,
      type: "module",
      exports: { ".": { types: "./index.ts", import: "./index.ts" } },
      main: "./index.ts",
      types: "./index.ts",
    }, null, 2))
  }

  const linkIndex = join(linkDir, "index.ts")
  writeFileSync(linkIndex, `export * from "./dist/index.js"\n`)

  built++
  console.log(`OK ${pkg}`)
}

console.log(`\n${built} built, ${failed} failed`)

if (failed > 0) {
  console.error("Some packages failed to build. Check errors above.")
  process.exit(1)
}
