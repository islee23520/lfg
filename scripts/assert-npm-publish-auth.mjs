#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { evaluateNpmPublishAuth } from "../plugins/lfg/dist/npm-publish-auth.js"

let npmUser = null
try {
  npmUser = execFileSync("npm", ["whoami"], { encoding: "utf8" }).trim()
} catch {
  npmUser = null
}
const auth = evaluateNpmPublishAuth(npmUser)
console.log(JSON.stringify(auth))
process.exit(auth.ok ? 0 : 2)