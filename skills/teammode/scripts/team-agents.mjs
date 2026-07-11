// team-agents.mjs - subagent_type catalog for GrokBuild teammode (spawn_subagent transport).
//
// Members may use EITHER:
// - GrokBuild host built-ins (always present when spawn_subagent exists)
// - lfg-installed OMO / convenience / category agents (after lfg setup --run agent sync)
//
// Aliases normalize common OMO/OpenCode names onto the host-facing id actually used in
// spawn_subagent({ subagent_type }).

/** Host built-ins from GrokBuild spawn_subagent surface (tool schema / host registry). */
export const GROK_BUILTIN_SUBAGENT_TYPES = Object.freeze([
	"general-purpose",
	"explore",
	"plan",
])

/**
 * lfg-owned OMO + Grok convenience + category agents materialised under ~/.grok
 * (native-omo-agents / GROK_AGENT_NAMES + category personas from install).
 */
export const LFG_OMO_SUBAGENT_TYPES = Object.freeze([
	// Core OMO
	"default",
	"sisyphus",
	"hephaestus",
	"prometheus",
	"atlas",
	"oracle",
	"multimodal-looker",
	"sisyphus-junior",
	"explorer",
	"librarian",
	"metis",
	"momus",
	// Grok convenience
	"reasoning",
	"coding",
	"plan",
	"reviewer",
	// Category / install personas commonly present after setup
	"deep",
	"quick",
	"ultrabrain",
	"ulw",
	"writing",
	"visual-engineering",
	"artistry",
	"artistry-gen",
	"artistry-qa",
	"unspecified-low",
	"unspecified-high",
])

/** OpenCode / OMO / informal aliases → preferred GrokBuild subagent_type. */
export const SUBAGENT_TYPE_ALIASES = Object.freeze({
	// Host built-ins
	"general-purpose": "general-purpose",
	general: "general-purpose",
	gp: "general-purpose",
	explore: "explore",
	// lfg OMO explore is installed as "explorer" — keep distinct from host "explore"
	explorer: "explorer",
	// OMO names
	sisyphus: "sisyphus",
	hephaestus: "hephaestus",
	prometheus: "prometheus",
	atlas: "atlas",
	oracle: "oracle",
	librarian: "librarian",
	metis: "metis",
	momus: "momus",
	"multimodal-looker": "multimodal-looker",
	"sisyphus-junior": "sisyphus-junior",
	// Grok convenience
	coding: "coding",
	reasoning: "reasoning",
	reviewer: "reviewer",
	builder: "reviewer",
	"grok-build": "coding",
	// plan is both a host builtin and an lfg agent name — same id
	plan: "plan",
	// default / deep worker
	default: "default",
	// deep is both alias intent and installed persona — prefer installed "deep"
	deep: "deep",
	worker: "hephaestus",
	impl: "coding",
	implementation: "coding",
	qa: "reviewer",
	search: "explore",
	research: "librarian",
	// categories
	quick: "quick",
	ultrabrain: "ultrabrain",
	ulw: "ulw",
	writing: "writing",
	"visual-engineering": "visual-engineering",
	artistry: "artistry",
	"artistry-gen": "artistry-gen",
	"artistry-qa": "artistry-qa",
	"unspecified-low": "unspecified-low",
	"unspecified-high": "unspecified-high",
})

export const DEFAULT_SPAWN_SUBAGENT_TYPE = "hephaestus"

const ALLOWED = new Set([...GROK_BUILTIN_SUBAGENT_TYPES, ...LFG_OMO_SUBAGENT_TYPES])

export function isGrokBuiltinSubagentType(type) {
	return GROK_BUILTIN_SUBAGENT_TYPES.includes(type)
}

export function isLfgOmoSubagentType(type) {
	return LFG_OMO_SUBAGENT_TYPES.includes(type)
}

/**
 * Resolve a user/leader-provided type string to a spawn_subagent subagent_type.
 * Accepts host built-ins, lfg OMO agents, and known aliases.
 */
export function resolveTeamSubagentType(raw, { defaultType = DEFAULT_SPAWN_SUBAGENT_TYPE } = {}) {
	const trimmed = typeof raw === "string" ? raw.trim() : ""
	const key = trimmed || defaultType
	const lower = key.toLowerCase()
	const resolved = SUBAGENT_TYPE_ALIASES[lower] ?? (ALLOWED.has(key) ? key : ALLOWED.has(lower) ? lower : null)
	if (!resolved || !ALLOWED.has(resolved)) {
		const catalog = [
			`GrokBuild built-ins: ${GROK_BUILTIN_SUBAGENT_TYPES.join(", ")}`,
			`lfg agents: ${LFG_OMO_SUBAGENT_TYPES.join(", ")}`,
		].join("; ")
		throw new Error(
			`invalid subagent_type "${key}" - use a GrokBuild builtin or installed lfg agent (${catalog}). ` +
				`Hint: after pulling teammode changes run: node dist/lfg.js --json setup --run --force`,
		)
	}
	return resolved
}

export function recommendSubagentTypeForLens(lens, focusHint = "") {
	const f = `${focusHint}`.toLowerCase()
	if (lens === "perspective" && /review|qa|audit|verify/.test(f)) return "reviewer"
	if (lens === "perspective" && /plan|design|architect/.test(f)) return "plan"
	if (/doc|api reference|external|library/.test(f)) return "librarian"
	if (/search|find|locate|codebase|explore|read-only/.test(f)) return "explore"
	if (/plan|spec|design/.test(f)) return "plan"
	if (/vision|image|screenshot|pdf/.test(f)) return "multimodal-looker"
	if (/reason|debug|oracle/.test(f)) return "oracle"
	if (/code|impl|fix|feature|api|ui/.test(f)) return "coding"
	return DEFAULT_SPAWN_SUBAGENT_TYPE
}

export function formatSubagentCatalogHelp() {
	return [
		"GrokBuild built-ins (host): " + GROK_BUILTIN_SUBAGENT_TYPES.join(", "),
		"lfg OMO / convenience / category agents: " + LFG_OMO_SUBAGENT_TYPES.join(", "),
		"Aliases: explore↔search, explorer (lfg), hephaestus/worker, coding/impl, reviewer/qa/builder, librarian/research, plan",
		"Note: a team needs ≥2 members before bind-subagent. Prefer host built-ins if a persona is missing from this session.",
	].join("\n")
}
