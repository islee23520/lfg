#!/usr/bin/env node
import { chmod } from "node:fs/promises"
import { build } from "esbuild"

const outputs = [
  ["plugins/lfg/bin/lfg.ts", "plugins/lfg/dist/lfg.js"],
  ["plugins/lfg/bin/self-test.ts", "plugins/lfg/dist/self-test.js"],
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

await Promise.all(outputs.map(([, outfile]) => chmod(outfile, 0o755)))
