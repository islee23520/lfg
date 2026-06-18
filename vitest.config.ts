import { defineConfig } from "vitest/config"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

/** Reduce flakes from concurrent `npm pack` / parallel setup+model servers (#140). */
export default defineConfig({
  plugins: [
    {
      name: "raw-md-loader",
      enforce: "pre",
      resolveId(source, importer) {
        if (source.endsWith(".md") && importer) {
          return resolve(dirname(importer), source)
        }
        return null
      },
      load(id) {
        if (id.endsWith(".md")) {
          const content = readFileSync(id, "utf8")
          return `export default ${JSON.stringify(content)}`
        }
        return null
      },
    },
  ],
  test: {
    env: {
      LFG_ALLOW_TEST_GROK_HOME: "1",
    },
    fileParallelism: false,
  },
})
