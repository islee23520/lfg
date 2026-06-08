import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { validateGrokHooksJson } from "./hook-trust"

export type GrokHookEntry = {
  readonly name: string
  readonly description: string
}

/** Hooks re-implemented for Grok (LFP visual guidance port — metadata only in hooks.json). */
export const LFG_PORTED_GROK_HOOKS: readonly GrokHookEntry[] = [
  {
    name: "lfg-visual-guidance",
    description: "Visual / art-team guidance hook (ported for Grok Build)",
  },
  {
    name: "lfg-agent-reminder",
    description: "Reminder to check agent model overrides after discovery",
  },
] as const

export async function mergePortedHooksIntoPlugin(pluginRoot: string): Promise<{ readonly path: string; readonly hookNames: readonly string[] }> {
  const hooksPath = join(pluginRoot, "hooks", "hooks.json")
  await mkdir(dirname(hooksPath), { recursive: true })
  const existing = await readExistingHooks(hooksPath)
  const merged = mergeHookLists(existing, LFG_PORTED_GROK_HOOKS)
  const payload = { hooks: merged }
  const validated = validateGrokHooksJson(payload)
  if (!validated.ok) {
    throw new Error(validated.error ?? "invalid hooks.json after merge")
  }
  await writeFile(hooksPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  return { path: hooksPath, hookNames: validated.hookNames }
}

async function readExistingHooks(path: string): Promise<readonly GrokHookEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"))
    const validated = validateGrokHooksJson(parsed)
    if (!validated.ok) {
      return []
    }
    const record = parsed as { hooks: readonly { name: string; description?: string }[] }
    return record.hooks.map((h) => ({ name: h.name, description: h.description ?? "" }))
  } catch {
    return []
  }
}

function mergeHookLists(existing: readonly GrokHookEntry[], ported: readonly GrokHookEntry[]): GrokHookEntry[] {
  const byName = new Map<string, GrokHookEntry>()
  for (const hook of existing) {
    byName.set(hook.name, hook)
  }
  for (const hook of ported) {
    byName.set(hook.name, hook)
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}