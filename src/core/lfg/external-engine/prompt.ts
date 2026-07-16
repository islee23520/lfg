import type { Engine } from "./engines"
import type { RoleSpec, SafetyMode } from "./omo-roles"
import { buildSkillRoutePromptSection, routeOmoSkills, type SkillRoute } from "./skill-route"

export const HANDOFF_HONESTY =
  "Work as the sole Codex implementer in this project. Prefer the app-server thread; codex exec is fallback only when the daemon is unavailable. Grok may orchestrate but does not implement."

type PromptInput = {
  readonly spec: RoleSpec
  readonly engine: Engine
  readonly safetyMode: SafetyMode
  readonly canWrite: boolean
  readonly focus: string
  readonly deliverable: string
  readonly scopePaths: readonly string[]
  readonly outOfScopePaths: readonly string[]
  readonly imagePaths: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly verifyCommands: readonly string[]
  readonly resultPath?: string | null
  readonly agentsMdExcerpt?: string
  readonly skillExcerpts?: Readonly<Record<string, string>>
  readonly skillRoute?: SkillRoute
}

export function buildHandoffPrompt(input: PromptInput): string {
  const scope = bullets(input.scopePaths, "(repo working directory)")
  const out = bullets(input.outOfScopePaths, "(none)")
  const images = bullets(input.imagePaths, "(none)")
  const accept = bullets(input.acceptanceCriteria, "Meet DELIVERABLE and SAFETY.")
  const verify =
    input.verifyCommands.length > 0
      ? input.verifyCommands.map((command) => `- \`${command}\``).join("\n")
      : input.canWrite
        ? "- Run project tests/typecheck for the touched surface."
        : "- Read-only — no mutating verify."
  const agents = input.agentsMdExcerpt?.trim()
    ? `\n## AGENTS / rules (inlined)\n\n${input.agentsMdExcerpt.trim()}\n`
    : "\n## AGENTS / rules\n\nRead AGENTS.md and project rules on disk.\n"
  const skillParts = Object.entries(input.skillExcerpts ?? {})
    .filter(([, body]) => body.trim().length > 0)
    .map(([name, body]) => `### ${name}\n\n${body.trim()}\n`)
  const skills = skillParts.length > 0 ? `\n## Embedded skill text\n\n${skillParts.join("\n")}` : ""

  return [
    `# Codex work — ${input.spec.role}`,
    "",
    input.spec.persona,
    "",
    "You are the **implementer**. Work in this repository the way you would in a normal Codex session.",
    "Edit real project files, run tests, and leave the tree clean. No special folder ceremony is required unless a receipt path is named below.",
    "",
    "## TASK",
    input.focus,
    "",
    "## DELIVERABLE",
    input.deliverable,
    "",
    "## SCOPE (in)",
    scope,
    "",
    "## SCOPE (out)",
    out,
    "",
    "## IMAGES",
    images,
    "",
    "## IMAGE GENERATION",
    "- For any drawing, generated image, mockup, illustration, or bitmap visual deliverable, load the Codex system skill `$imagegen` and follow it.",
    "- Prefer `$imagegen` over inventing pseudo-images with ASCII or code-only output when a real image is requested.",
    "- Save generated artifacts under project-relative paths and cite those paths in RESULT EVIDENCE.",
    "- Do not use Grok-only `image_gen` tools; they are unavailable inside Codex.",
    "",
    "## ACCEPTANCE",
    accept,
    "",
    "## SAFETY",
    `- **${input.safetyMode}** (canWrite=${input.canWrite})`,
    input.canWrite
      ? "- Write only within SCOPE. Minimal diffs. Verify after."
      : "- **READ-ONLY.** No file mutations or package installs.",
    "",
    agents,
    skills,
    buildSkillRoutePromptSection(input.skillRoute ?? routeOmoSkills(input.focus)),
    "## VERIFY",
    verify,
    "",
    ...returnContractSection(input.resultPath, input.canWrite),
    "## HONESTY",
    HANDOFF_HONESTY,
    "",
    "Begin now.",
  ].join("\n")
}

function returnContractSection(resultPath: string | null | undefined, canWrite: boolean): string[] {
  const path = typeof resultPath === "string" ? resultPath.trim() : ""
  if (path.length === 0) {
    return [
      "## DONE WHEN",
      "- The task is implemented in the real project tree (not a sandbox-only dump).",
      "- Tests/verification you ran are summarized in the thread reply.",
      "- No special receipt folder is required — work as in a normal Codex session.",
      canWrite ? "- Prefer minimal, reviewable diffs." : "- Stay read-only.",
      "",
    ]
  }
  return [
    "## OPTIONAL RECEIPT (orchestrator ledger)",
    `If convenient, also leave a short receipt at \`${path}\`:`,
    "- STATUS: pass, fail, or blocked",
    "- SUMMARY: one paragraph",
    "- EVIDENCE: commands/observables",
    canWrite ? "- CHANGED_FILES: list" : "- CHANGED_FILES: none",
    "- Primary work remains real project files; the receipt is secondary.",
    "",
  ]
}


function bullets(values: readonly string[], fallback: string): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`
}
