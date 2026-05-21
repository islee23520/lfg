#!/usr/bin/env bun
import { runAuditHook } from "../../src/hooks-ts"

const rawPayload = await Bun.stdin.text()
process.exit(runAuditHook(rawPayload))
