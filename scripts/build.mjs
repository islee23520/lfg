#!/usr/bin/env node
import { chmod, cp, mkdir } from "node:fs/promises"
import { build } from "esbuild"

const outputs = [
  ["plugins/lfg/bin/lfg.ts", "plugins/lfg/dist/lfg.js"],
  ["plugins/lfg/bin/self-test.ts", "plugins/lfg/dist/self-test.js"],
  ["plugins/lfg/bin/publish-readiness.ts", "plugins/lfg/dist/publish-readiness.js"],
  ["plugins/lfg/bin/npm-publish-auth.ts", "plugins/lfg/dist/npm-publish-auth.js"],
  ["plugins/lfg/bin/npm-registry-version.ts", "plugins/lfg/dist/npm-registry-version.js"],
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
await cp(fixtureSrc, fixtureDst, { recursive: true, force: true })

await Promise.all(outputs.map(([, outfile]) => chmod(outfile, 0o755)))
