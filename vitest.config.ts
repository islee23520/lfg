import { defineConfig } from "vitest/config"

/** Reduce flakes from concurrent `npm pack` / parallel setup+model servers (#140). */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
})