import { access, cp, mkdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ensures the cua-driver (Computer Use) skill is present under the materialized
 * ~/.grok/plugins/lfg/skills/cua-driver after LFG Grok install.
 *
 * This is what makes "Codex-style Computer Use" (native macOS app automation
 * via cua-driver) available to agents/personas when the user does
 * `npx @islee23520/lfg setup`.
 *
 * The skill is shipped inside the LFG package (in grok-install/skills and
 * also exposed at the package skills/ level). After materialization we
 * inject/repair it into the real owned directory so Grok Build's skill
 * surfaces see it under the lfg adapter.
 */

export async function ensureCuaDriverSkill(pluginRoot: string): Promise<{ readonly ensured: boolean; readonly path: string }> {
  const targetDir = join(pluginRoot, "skills", "cua-driver")
  const targetFile = join(targetDir, "SKILL.md")

  const bundled = await resolveBundledCuaDriverSkill()
  if (!bundled) {
    return { ensured: false, path: targetFile }
  }

  let need = false
  try {
    await access(targetFile)
    const existing = await readFile(targetFile, "utf8")
    if (existing.length < 300 || /placeholder|TODO|stub|TODO: implement/i.test(existing)) {
      need = true
    }
  } catch {
    need = true
  }

  if (!need) {
    return { ensured: false, path: targetFile }
  }

  await mkdir(targetDir, { recursive: true })
  await cp(bundled, targetFile, { force: true })

  return { ensured: true, path: targetFile }
}

/**
 * Find the cua-driver/SKILL.md that is bundled with the currently running LFG.
 * Works from:
 * - dist/grok-install (after `npm run build`)
 * - source grok-install during dev
 * - the top-level skills/ that is part of the published package
 */
export async function resolveBundledCuaDriverSkill(): Promise<string | null> {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // dist layout (what actually ships in the npm tarball and what run-internal sees at runtime)
    join(here, "grok-install", "skills", "cua-driver", "SKILL.md"),
    join(here, "..", "grok-install", "skills", "cua-driver", "SKILL.md"),
    // source tree next to this module
    join(here, "skills", "cua-driver", "SKILL.md"),
    join(here, "..", "skills", "cua-driver", "SKILL.md"),
    // published package root skills/ (declared in "files")
    join(here, "..", "..", "skills", "cua-driver", "SKILL.md"),
  ]
  for (const p of candidates) {
    try {
      await access(p)
      return p
    } catch {
      // keep looking
    }
  }
  return null
}
