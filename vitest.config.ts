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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "src/core/omo/ulw-loop/**/*.{ts,js}",
        "src/cli/ulw-loop/**/*.{ts,js}",
      ],
      exclude: [
        "**/*.test.ts",
        "**/directive.md",
        // Host entry that auto-exits when run as a script; covered via lfg-ulw-loop dispatcher.
        "src/core/omo/ulw-loop/cli.ts",
        // Type-only / re-export barrels (no runtime branches).
        "src/core/omo/ulw-loop/types.ts",
        "src/core/omo/ulw-loop/domain-types.ts",
        "src/core/omo/ulw-loop/command-types.ts",
        "src/core/omo/ulw-loop/steering-types.ts",
      ],
      // Ratchet toward 100% TDD coverage of the ulw-loop product surface.
      // Floors track the latest measured train; raise only when tests land.
      // Target remains 100/100/100/100 (see AGENTS.md + coverage evidence).
      thresholds: {
        lines: 90,
        functions: 95,
        branches: 70,
        statements: 85,
      },
    },
  },
})
