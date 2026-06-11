#!/usr/bin/env node
import { chmod, cp, mkdir, readdir, rename, rm } from "node:fs/promises"
import { build } from "esbuild"

const outputs = [
  ["plugins/lfg/bin/lfg.ts", "plugins/lfg/dist/lfg.js"],
  ["plugins/lfg/bin/self-test.ts", "plugins/lfg/dist/self-test.js"],
  ["plugins/lfg/bin/publish-readiness.ts", "plugins/lfg/dist/publish-readiness.js"],
  ["plugins/lfg/bin/npm-publish-auth.ts", "plugins/lfg/dist/npm-publish-auth.js"],
  ["plugins/lfg/bin/npm-registry-version.ts", "plugins/lfg/dist/npm-registry-version.js"],
  ["plugins/lfg/bin/npm-publish-bin.ts", "plugins/lfg/dist/npm-publish-bin.js"],
  ["plugins/lfg/bin/npm-registry-bin.ts", "plugins/lfg/dist/npm-registry-bin.js"],
]

await Promise.all(
  outputs.map(([entryPoint, outfile]) =>
    build({
      entryPoints: [entryPoint],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      sourcemap: true,
      target: "node20",
    }),
  ),
)

const fixtureSrc = "plugins/lfg/grok-install/fixture-minimal"
const fixtureDst = "plugins/lfg/dist/grok-install/fixture-minimal"
const grokDistDir = "plugins/lfg/dist/grok-install"
await mkdir(grokDistDir, { recursive: true })
await Promise.all(
  (await readdir(grokDistDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("fixture-minimal.build-"))
    .map((entry) => rm(`${grokDistDir}/${entry.name}`, { recursive: true, force: true })),
)
const fixtureTmp = `${fixtureDst}.build-${process.pid}-${Date.now()}`
await rm(fixtureTmp, { recursive: true, force: true })
await cp(fixtureSrc, fixtureTmp, { recursive: true })
const bridgeSrc = "plugins/lfg/grok-install/assets/lfg-grok-hook-bridge.mjs"
const configLoaderSrc = "plugins/lfg/grok-install/assets/lfg-config-loader.mjs"
const projectOmoLedgerSrc = "plugins/lfg/grok-install/assets/lfg-project-omo-ledger.mjs"
const bridgeDstDir = "plugins/lfg/dist/grok-install/assets"
await mkdir(bridgeDstDir, { recursive: true })
await cp(bridgeSrc, `${bridgeDstDir}/lfg-grok-hook-bridge.mjs`)
await cp(configLoaderSrc, `${bridgeDstDir}/lfg-config-loader.mjs`)
await cp(projectOmoLedgerSrc, `${bridgeDstDir}/lfg-project-omo-ledger.mjs`)
const flavourSrc = "plugins/lfg/grok-install/flavour-pack-assets"
const flavourDst = "plugins/lfg/dist/grok-install/flavour-pack-assets"
await cp(flavourSrc, flavourDst, { recursive: true })

// Copy LFG-bundled skills (e.g. cua-driver / Computer Use) so they are present
// in the internal grok-install source tree and end up under
// ~/.grok/installed-plugins/lfg/skills after setup. This guarantees that
// after `npx @islee23520/lfg setup` the cua-driver skill is available for
// agents and personas, exactly like the Codex computer-use skill.
const skillsSrc = "plugins/lfg/grok-install/skills"
const skillsDst = "plugins/lfg/dist/grok-install/skills"
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
