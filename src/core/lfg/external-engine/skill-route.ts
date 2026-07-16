/**
 * Sisyphus skill routing: map task focus → OMO / Codex skills that MUST
 * appear in the external worker brief. Do not forget skills on handoff.
 */

export type SkillRouteHit = {
  readonly id: string
  readonly codexLoad?: string
  readonly reason: string
}

export type SkillRoute = {
  readonly skills: readonly SkillRouteHit[]
  readonly loadContract: string
  readonly ceoSummary: string
}

type Rule = {
  readonly id: string
  readonly codexLoad?: string
  readonly reason: string
  readonly re: RegExp
  readonly priority: number
}

const RULES: readonly Rule[] = [
  { id: "ulw-plan", codexLoad: "$ulw-plan", reason: "planning / decision-complete plan", re: /\/ulw-plan\b|\bulw-plan\b|\bhyperplan\b|\bwrite\s+(a\s+)?plan\b|\bplan\s+before\b|\bbreak\s+(this|it)\s+down\b/i, priority: 10 },
  { id: "start-work", codexLoad: "$start-work", reason: "execute approved plan / boulder", re: /\b(start[\s-]?work|execute\s+plan|continue\s+plan|resume\s+plan)\b|\.omo\/plans\//i, priority: 10 },
  { id: "ulw-loop", codexLoad: "$ulw-loop", reason: "durable multi-goal loop", re: /\bulw-loop\b|\bmulti[\s-]?goal\b|\bdurable\s+goal\b/i, priority: 15 },
  { id: "ulw-research", codexLoad: "$ulw-research", reason: "max research saturation", re: /\bulw-research\b|\bultraresearch\b|\bdeep\s+research\b/i, priority: 10 },
  { id: "programming", reason: "typed code in py/rs/ts/go", re: /\b(implement|fix|refactor|code|patch|wire|typescript|python|\.tsx?|\.py\b|\.rs\b|\.go\b|vitest|tdd)\b/i, priority: 40 },
  { id: "debugging", reason: "runtime debug / root cause", re: /\b(debug|crash|hang|leak|root\s+cause|trace\s+this|silent\s+fail|reproduce)\b/i, priority: 20 },
  { id: "frontend", reason: "UI/UX/frontend polish", re: /\b(frontend|ui\/ux|\bux\b|\bui\b|react|css|tailwind|layout|redesign|mockup|lighthouse|a11y|accessibility)\b/i, priority: 25 },
  { id: "visual-qa", reason: "visual QA after UI change", re: /\b(visual[\s-]?qa|screenshot|pixel\s+diff|looks\s+wrong|ui\s+looks)\b/i, priority: 20 },
  { id: "refactor", reason: "structural refactor", re: /\b(refactor|restructure|extract|modernize|cleanup\s+code)\b/i, priority: 30 },
  { id: "remove-ai-slops", reason: "deslop AI code smells", re: /\b(deslop|ai\s+slop|remove\s+slop|clean\s+ai\s+code)\b/i, priority: 15 },
  { id: "git-master", reason: "git history / commit craft", re: /\b(git|commit|rebase|blame|bisect|reflog|squash|fixup|force-push)\b/i, priority: 20 },
  { id: "ast-grep", reason: "AST structural search/rewrite", re: /\bast[\s-]?grep\b|\bcodemod\b/i, priority: 25 },
  { id: "lsp", reason: "language server diagnostics", re: /\blsp\b|\bdiagnostics\b|\brename\s+symbol\b/i, priority: 30 },
  { id: "lsp-setup", reason: "configure language server", re: /\blsp[\s-]?setup\b|\blanguage\s+server\b/i, priority: 25 },
  { id: "ultimate-browsing", reason: "blocked/hard web access", re: /\b(cloudflare|waf|403|stealth\s+browser|bypass\s+bot)\b/i, priority: 20 },
  { id: "review-work", reason: "post-implementation multi-oracle review", re: /\b(review\s+work|review\s+my\s+work|post[\s-]?implementation\s+review)\b/i, priority: 15 },
  { id: "teammode", reason: "multi-agent team orchestration", re: /\b(teammode|team\s+mode|run\s+as\s+a\s+team)\b/i, priority: 15 },
  { id: "cua-driver", reason: "native GUI automation", re: /\b(cua[\s-]?driver|drive\s+(the\s+)?(app|gui|macos))\b/i, priority: 15 },
  { id: "coding-agent-sessions", reason: "inspect other agent sessions", re: /\b(coding[\s-]?agent\s+sessions?|session\s+transcript)\b/i, priority: 20 },
  { id: "imagegen", codexLoad: "$imagegen", reason: "bitmap image generation", re: /\b(draw|imagegen|image\s+gen|generate\s+(an?\s+)?image|mockup|illustration|logo\s+concept|Imagine|그려|이미지)\b/i, priority: 10 },
]

const DEFAULT_CODING: SkillRouteHit = { id: "programming", reason: "default code craft for product implementation" }
const MAX_SKILLS = 5

export function routeOmoSkills(focus: string, options: { readonly max?: number } = {}): SkillRoute {
  const text = typeof focus === "string" ? focus.trim() : ""
  const max = options.max ?? MAX_SKILLS
  if (text.length === 0) {
    return { skills: [], loadContract: "", ceoSummary: "No focus — no skill route." }
  }

  const hits: SkillRouteHit[] = []
  const seen = new Set<string>()
  for (const rule of [...RULES].sort((a, b) => a.priority - b.priority)) {
    if (!rule.re.test(text) || seen.has(rule.id)) continue
    seen.add(rule.id)
    hits.push({ id: rule.id, ...(rule.codexLoad ? { codexLoad: rule.codexLoad } : {}), reason: rule.reason })
    if (hits.length >= max) break
  }

  const implShaped = /\b(implement|fix|add|build|patch|wire|code|test|verify)\b/i.test(text)
  if (implShaped && !seen.has("programming") && hits.length < max) hits.push(DEFAULT_CODING)

  const loadLines = hits.map((hit) =>
    hit.codexLoad
      ? `HARD REQUIRE: load Codex skill \`${hit.codexLoad}\` (${hit.reason}).`
      : `HARD REQUIRE: follow OMO skill \`${hit.id}\` (${hit.reason}); treat as mandatory procedure (embed if Codex lacks plugin skills).`,
  )

  const loadContract =
    hits.length === 0
      ? ""
      : ["## SKILL ROUTE (Sisyphus → Codex)", ...loadLines, `Skills: ${hits.map((h) => h.codexLoad ?? h.id).join(", ")}`].join("\n")

  const ceoSummary =
    hits.length === 0
      ? "Skill route empty — name OMO skills before handoff if work is non-trivial."
      : `Skill route: ${hits.map((h) => `${h.id}${h.codexLoad ? ` (${h.codexLoad})` : ""}`).join(", ")}`

  return { skills: hits, loadContract, ceoSummary }
}

export function enrichFocusWithSkillRoute(focus: string): { readonly focus: string; readonly route: SkillRoute } {
  const base = focus.replace(/\s+/g, " ").trim()
  const route = routeOmoSkills(base)
  if (route.loadContract.length === 0) return { focus: base, route }
  const shortLoads = route.skills.map((h) => h.codexLoad ?? h.id).slice(0, 5).join(" ")
  return { focus: `SKILLS[${shortLoads}] ${base}`.slice(0, 2000), route }
}

export function buildSkillRoutePromptSection(route: SkillRoute): string {
  if (route.skills.length === 0) return ""
  return [
    "## SKILL ROUTE (mandatory)",
    "Sisyphus selected these skills. You MUST load/follow them before coding:",
    ...route.skills.map((h) => {
      const load = h.codexLoad ? `Codex skill ${h.codexLoad}` : `OMO skill \`${h.id}\``
      return `- ${load} — ${h.reason}`
    }),
    "If a Codex `$skill` is listed, load it. If only an OMO id is listed, follow that skill procedure from embedded text or project skills.",
    "",
  ].join("\n")
}
