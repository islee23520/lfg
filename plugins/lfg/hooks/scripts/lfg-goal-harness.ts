#!/usr/bin/env bun
import { runGoalHarness } from "../../src/hooks-ts"

const rawPayload = await Bun.stdin.text()
const result = runGoalHarness(rawPayload)
if (result.stdout) process.stdout.write(result.stdout)
process.exit(result.code)
