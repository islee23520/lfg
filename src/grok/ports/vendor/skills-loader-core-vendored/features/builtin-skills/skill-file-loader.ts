import { readFileSync } from "node:fs"
import { join } from "node:path"

type SkillFileReader = (path: string, encoding: "utf8") => string

function parseFrontmatterBody(content: string): string {
  if (!content.startsWith("---\n")) {
    return content
  }

  const endIndex = content.indexOf("\n---", 4)
  if (endIndex === -1) {
    return content
  }

  const bodyStart = content.indexOf("\n", endIndex + 4)
  return bodyStart === -1 ? "" : content.slice(bodyStart + 1)
}

export function createSharedSkillTemplateLoader(
	readFile: SkillFileReader = readFileSync,
	skillsRootPath: string,
): (skillName: string) => string {
	const cache = new Map<string, string>()
	return (skillName) => {
		const cached = cache.get(skillName)
		if (cached !== undefined) return cached
		const body = parseFrontmatterBody(readFile(join(skillsRootPath, skillName, "SKILL.md"), "utf8"))
		cache.set(skillName, body)
		return body
	}
}

export function loadSharedSkillTemplate(_skillName: string): string {
  throw new Error(
    "Bundled shared-skill markdown is deferred in lfg's curated skills-loader-core port; use createSharedSkillTemplateLoader with an explicit skillsRootPath."
  )
}
