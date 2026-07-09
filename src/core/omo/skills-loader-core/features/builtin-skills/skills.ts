import type { BrowserAutomationProvider } from "../../types"
import type { BuiltinSkill } from "./types"

const DEFERRED_TEMPLATE_NOTE =
  "Bundled upstream SKILL.md/template content is deferred in lfg's curated skills-loader-core port."

const playwrightSkill: BuiltinSkill = {
  name: "playwright",
  description: "MUST USE for any browser-related tasks. Browser automation via Playwright MCP - verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: DEFERRED_TEMPLATE_NOTE,
  mcpConfig: {
    playwright: {
      command: "npx",
      args: ["@playwright/mcp@latest"],
    },
  },
}

const playwrightCliSkill: BuiltinSkill = {
  name: "playwright",
  description: "MUST USE for any browser-related tasks. Browser automation via playwright-cli - verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: DEFERRED_TEMPLATE_NOTE,
}

const agentBrowserSkill: BuiltinSkill = {
  name: "playwright",
  description: "MUST USE for any browser-related tasks. Browser automation via agent-browser commands.",
  template: DEFERRED_TEMPLATE_NOTE,
}

const devBrowserSkill: BuiltinSkill = {
  name: "playwright",
  description: "MUST USE for browser-related development tasks that need persistent page state.",
  template: DEFERRED_TEMPLATE_NOTE,
}

const builtinSkillMetadata: readonly BuiltinSkill[] = [
  {
    name: "frontend",
    description: "Design-first UI development guidance for frontend implementation tasks.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "git-master",
    description: "MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S).",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "review-work",
    description: "Post-implementation review workflow for checking completed work.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "$omo:remove-ai-slops",
    description: "Remove common AI-generated code smells and low-quality patterns.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "init-deep",
    description: "Generate hierarchical AGENTS.md-style project instructions.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "debugging",
    description: "Structured debugging workflow for diagnosing and fixing defects.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "security-research",
    description: "Exploitability-driven security research workflow.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "security-review",
    description: "Security review workflow alias for security-research guidance.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
  {
    name: "visual-qa",
    description: "Visual quality assurance workflow for UI changes.",
    template: DEFERRED_TEMPLATE_NOTE,
  },
]

const teamModeSkill: BuiltinSkill = {
  name: "team-mode",
  description:
    "Team orchestration — create and manage parallel agent teams (OFF by default; enable via team_mode.enabled in config).",
  template: DEFERRED_TEMPLATE_NOTE,
}

export interface CreateBuiltinSkillsOptions {
  browserProvider?: BrowserAutomationProvider
  disabledSkills?: Set<string>
  teamModeEnabled?: boolean
}

export function createBuiltinSkills(options: CreateBuiltinSkillsOptions = {}): BuiltinSkill[] {
  const { browserProvider = "playwright", disabledSkills, teamModeEnabled = false } = options

  let browserSkill: BuiltinSkill
	if (browserProvider === "agent-browser") {
		browserSkill = agentBrowserSkill
	} else if (browserProvider === "dev-browser") {
		browserSkill = devBrowserSkill
	} else if (browserProvider === "playwright-cli") {
		browserSkill = playwrightCliSkill
	} else {
		browserSkill = playwrightSkill
	}

	const skills = [browserSkill, ...builtinSkillMetadata]

  if (teamModeEnabled && !disabledSkills?.has("team-mode")) {
    skills.push(teamModeSkill)
  }

  if (!disabledSkills) {
    return skills.map((skill) => ({ ...skill }))
  }

  return skills.filter((skill) => !disabledSkills.has(skill.name)).map((skill) => ({ ...skill }))
}

export interface ResolveActiveBuiltinSkillsOptions extends CreateBuiltinSkillsOptions {
  systemMcpNames: Set<string>
}

export function resolveActiveBuiltinSkills(options: ResolveActiveBuiltinSkillsOptions): BuiltinSkill[] {
  const { systemMcpNames, ...createOptions } = options

  return createBuiltinSkills(createOptions).filter((skill) => {
    if (!skill.mcpConfig) return true
    return !Object.keys(skill.mcpConfig).some((mcpName) => systemMcpNames.has(mcpName))
  })
}
