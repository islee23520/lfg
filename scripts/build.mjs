#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, rename, rm } from "node:fs/promises"
import { build } from "esbuild"

const outputs = [
  ["src/cli/lfg.ts", "dist/lfg.js"],
  ["src/cli/self-test.ts", "dist/self-test.js"],
  ["src/cli/publish-readiness.ts", "dist/publish-readiness.js"],
  ["src/cli/npm-publish-auth.ts", "dist/npm-publish-auth.js"],
  ["src/cli/npm-registry-version.ts", "dist/npm-registry-version.js"],
  ["src/cli/npm-publish-bin.ts", "dist/npm-publish-bin.js"],
  ["src/cli/npm-registry-bin.ts", "dist/npm-registry-bin.js"],
  // TUI module for LFP-style Clack setup on TTY (dynamic import from the main bundle).
  // Built as a separate file (like LFP's setup-tui.mjs) so the runtime relative import works.
  // Its runtime deps (@clack/prompts, picocolors) are declared in root package.json "dependencies"
  // and externalized here so the emitted module retains bare imports resolved from the installed package.
  ["src/cli/lfg-setup-tui.ts", "dist/lfg-setup-tui.js"],
]

const distDir = "dist"
const buildLockDir = `${distDir}/.build.lock`

await mkdir(distDir, { recursive: true })
await acquireBuildLock(buildLockDir)
try {
  await Promise.all(
    outputs.map(([entryPoint, outfile]) => {
      const isTui = entryPoint.includes("lfg-setup-tui")
      return build({
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        sourcemap: true,
        target: "node20",
        ...(isTui ? { external: ["@clack/prompts", "picocolors"] } : {}),
      })
    }),
  )

  const fixtureSrc = "src/grok-adapter/fixture-minimal"
  const fixtureDst = "dist/grok-install/fixture-minimal"
  const grokDistDir = "dist/grok-install"
  await mkdir(grokDistDir, { recursive: true })
  await Promise.all(
    (await readdir(grokDistDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("fixture-minimal.build-"))
      .map((entry) => rm(`${grokDistDir}/${entry.name}`, { recursive: true, force: true })),
  )
  const fixtureTmp = `${fixtureDst}.build-${process.pid}-${Date.now()}`
  await rm(fixtureTmp, { recursive: true, force: true })
  await cp(fixtureSrc, fixtureTmp, { recursive: true })
  const bridgeSrc = "src/grok-adapter/assets/lfg-grok-hook-bridge.mjs"
  const configLoaderSrc = "src/grok-adapter/assets/lfg-config-loader.mjs"
  const projectOmoLedgerSrc = "src/grok-adapter/assets/lfg-project-omo-ledger.mjs"
  const bridgeDstDir = "dist/grok-install/assets"
  await mkdir(bridgeDstDir, { recursive: true })
  await cp(bridgeSrc, `${bridgeDstDir}/lfg-grok-hook-bridge.mjs`)
  await cp(configLoaderSrc, `${bridgeDstDir}/lfg-config-loader.mjs`)
  await cp(projectOmoLedgerSrc, `${bridgeDstDir}/lfg-project-omo-ledger.mjs`)
  const flavourSrc = "src/grok-adapter/flavour-pack-assets"
  const flavourDst = "dist/grok-install/flavour-pack-assets"
  await cp(flavourSrc, flavourDst, { recursive: true })

  // Copy LFG-bundled skills (cua-driver + T8 ulw-plan/ulw-loop self-contained workflows)
  // so they are present in the internal grok-install source tree and end up under
  // ~/.grok/plugins/lfg/skills after setup. Guarantees discoverable
  // Phase 0/Approval gate/Phase 3 + Bootstrap/Execution Loop/Manual-QA headings
  // without sibling-path guessing (source-of-truth to avoid drift).
  const skillsSrc = "src/grok-adapter/skills"
  const skillsDst = "dist/grok-install/skills"
  await cp(skillsSrc, skillsDst, { recursive: true })
  for (let attempt = 0; attempt < 8; attempt++) {
    await rm(fixtureDst, { recursive: true, force: true })
    try {
      await rename(fixtureTmp, fixtureDst)
      break
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EEXIST") {
        throw error
      }
      if (attempt === 7) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }

  await Promise.all(outputs.map(([, outfile]) => chmod(outfile, 0o755)))
} finally {
  await rm(buildLockDir, { recursive: true, force: true })
}

async function acquireBuildLock(lockDir) {
  const startedAt = Date.now()
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lockDir)
      return
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null
      if (code !== "EEXIST") {
        throw error
      }
      if (Date.now() - startedAt > 120_000) {
        throw new Error(`Timed out waiting for build lock at ${lockDir}`)
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(25 * (attempt + 1), 250)))
    }
  }
}
