#!/usr/bin/env bun
import { runStdioServer } from "../src/mcp-ts/server"

runStdioServer().catch((error) => {
  process.stderr.write(`lfg-mcp: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
