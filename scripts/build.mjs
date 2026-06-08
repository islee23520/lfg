#!/usr/bin/env node
import { chmod, cp, mkdir, rename, rm } from "node:fs/promises"
import { build } from "esbuild"

const outputs = [
  ["plugins/lfg/bin/lfg.ts", "plugins/lfg/dist/lfg.js"],
  ["plugins/lfg/bin/self-test.ts", "plugins/lfg/dist/self-test.js"],
  ["plugins/lfg/bin/publish-readiness.ts", "plugins/lfg/dist/publish-readiness.js"],
  ["plugins/lfg/bin/npm-publish-auth.ts", "plugins/lfg/dist/npm-publish-auth.js"],
  ["plugins/lfg/bin/npm-registry-version.ts", "plugins/lfg/dist/npm-registry-version.js"],
  ["plugins/lfg/bin/npm-publish-bin.ts", "plugins/lfg/dist/npm-publish-bin.js"],
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
await mkdir("plugins/lfg/dist/grok-install", { recursive: true })
const fixtureTmp = `${fixtureDst}.build-${process.pid}-${Date.now()}`
await rm(fixtureTmp, { recursive: true, force: true })
await cp(fixtureSrc, fixtureTmp, { recursive: true })
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
