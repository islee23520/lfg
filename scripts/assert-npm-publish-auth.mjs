#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { evaluateNpmPublishAuth } from "../plugins/lfg/dist/npm-publish-auth.js"

let npmUser = resolveNpmWhoami()

/** Test hook: LFG_NPM_WHOAMI="" forces unauthenticated. */
function resolveNpmWhoami() {
  const override = process.env.LFG_NPM_WHOAMI
  if (override === "" || override === "__none__") {
    return null
  }
  if (typeof override === "string" && override.length > 0) {
    return override.trim()
  }
  try {
    return execFileSync("npm", ["whoami"], { encoding: "utf8" }).trim()
  } catch {
    return null
  }
}
const auth = evaluateNpmPublishAuth(npmUser)
console.log(JSON.stringify(auth))
process.exit(auth.ok ? 0 : 2)