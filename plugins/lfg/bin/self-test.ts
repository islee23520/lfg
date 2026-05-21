#!/usr/bin/env bun
import { runSelfTest } from "../src/smoke-ts/runner"

const result = await runSelfTest()
process.exit(result.ok ? 0 : 1)
