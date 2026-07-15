import type { Engine } from "./engines"
import type { RoleSpec, SafetyMode } from "./omo-roles"

export const HANDOFF_HONESTY =
  "OMO-like full handoff: Grok is Sisyphus (orchestrator only). Codex app-server is the sole GPT worker; codex exec is fallback only when the daemon is unavailable. Grok hooks and custom subagents do NOT run inside Codex. Embed AGENTS/skills as text."

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
  readonly resultPath: string
  readonly agentsMdExcerpt?: string
  readonly skillExcerpts?: Readonly<Record<string, string>>
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
    `# OMO-LIKE FULL HANDOFF — ${input.engine} as ${input.spec.role}`,
    "",
    input.spec.persona,
    "",
    "You are the **sole executor**. Do not wait for Grok subagents or host hooks.",
    "Grok (Sisyphus) only orchestrates; you finish this job and return RESULT.",
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
    "## VERIFY",
    verify,
    "",
    "## RETURN CONTRACT",
    `Write or print RESULT at \`${input.resultPath}\`:`,
    "- STATUS: pass, fail, or blocked",
    "- SUMMARY: one paragraph",
    "- EVIDENCE: commands/images/observables",
    input.canWrite ? "- CHANGED_FILES: list" : "- CHANGED_FILES: none",
    "- RISKS: residual or none",
    "",
    "## HONESTY",
    HANDOFF_HONESTY,
    "",
    "Begin now.",
  ].join("\n")
}

function bullets(values: readonly string[], fallback: string): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`
}
