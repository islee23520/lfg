#!/usr/bin/env bun
const checks = [
  await commandOk(["lazycodex", "install"], "npx lazycodex-ai install"),
  await commandOk(["lazycodex", "status"], "npx lazycodex-ai install"),
  await commandOk(["config", "grok-byok"], "config grok-byok"),
  await commandOk(["doctor"], "\"ok\": true"),
]

for (const [index, ok] of checks.entries()) {
  process.stdout.write(`check-${index + 1}=${ok ? "ok" : "fail"}\n`)
}

process.exit(checks.every(Boolean) ? 0 : 1)

async function commandOk(args: readonly string[], expected: string): Promise<boolean> {
  const proc = Bun.spawn([new URL("lfg", import.meta.url).pathname, "--json", ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  return code === 0 && stdout.includes(expected)
}
