import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const scopeRoot = join(pluginRoot, "vendor", "omo-standalone", "node_modules", "@oh-my-opencode")

const packages = [
  "adapter-codex",
  "adapter-opencode",
  "agents-md-core",
  "ast-grep-core",
  "boulder-state",
  "comment-checker-core",
  "hooks-core",
  "model-core",
  "rules-engine",
  "skills-core",
  "standalone-runtime",
  "ulw-host-contract",
  "ulw-intent",
  "ulw-kernel",
  "ulw-loop-state",
  "utils",
]

rmSync(join(pluginRoot, "vendor", "omo-standalone", "node_modules"), { force: true, recursive: true })
mkdirSync(scopeRoot, { recursive: true })

for (const packageName of packages) {
  const packageRoot = join(scopeRoot, packageName)
  mkdirSync(packageRoot, { recursive: true })
  writeFileSync(
    join(packageRoot, "package.json"),
    `${JSON.stringify({
      name: `@oh-my-opencode/${packageName}`,
      version: "0.1.0",
      type: "module",
      exports: { ".": { types: "./index.ts", import: "./index.ts" } },
      main: "./index.ts",
      types: "./index.ts",
    })}\n`,
  )
  writeFileSync(join(packageRoot, "index.ts"), `export * from "../../../packages/${packageName}/src/index.ts"\n`)
}
