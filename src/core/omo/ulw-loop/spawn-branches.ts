/**
 * Category-aware sub-agent spawning for ulw-loop.
 *
 * Pure host-neutral planning: takes an UlwLoopPlan, categorizes each
 * schedulable goal by objective keywords, maps to a default GrokBuild
 * subagent_type + reasoning level + background flag, and emits a spawn
 * plan that a caller can dispatch through `spawn_subagent` /
 * `spawn_subagent({ background: true })` semantics.
 *
 * This module DOES NOT spawn anything itself. It returns a plan. A
 * host adapter (e.g. `src/grok/ports/`) is responsible for turning
 * each UlwLoopBranchSpawn into a real `spawn_subagent` invocation.
 *
 * Categories mirror the GrokBuild task-tool category enum plus the
 * OMO agent registry names (atlas / sisyphus / hephaestus / metis /
 * sisyphus-junior) so the spawn plan wires directly into the existing
 * teammode spawn_subagent transport.
 */

import type { UlwLoopItem, UlwLoopPlan } from "./domain-types.js"

/**
 * Category enum. Intentionally matches the runtime categories surfaced
 * by the GrokBuild task tool plus OMO agent families.
 */
export type UlwLoopSpawnCategory =
	| "explore"
	| "coding"
	| "writing"
	| "reasoning"
	| "visual-engineering"
	| "quick"
	| "unspecified-low"
	| "unspecified-high"
	| "artistry"
	| "deep"
	| "ultrabrain"

/**
 * Per-category routing: which subagent_type to spawn, whether to run
 * in the background, and the reasoning_effort hint to pass.
 */
export interface UlwLoopCategoryRoute {
	readonly category: UlwLoopSpawnCategory
	readonly subagentType: string
	readonly background: boolean
	readonly reasoningLevel: "low" | "medium" | "high" | "xhigh"
}

/**
 * A single scheduled branch: one goal → one spawn descriptor.
 * The host adapter consumes this and emits the real spawn_subagent call.
 */
export interface UlwLoopBranchSpawn {
	readonly goalId: string
	readonly goalTitle: string
	readonly category: UlwLoopSpawnCategory
	readonly subagentType: string
	readonly background: boolean
	readonly reasoningLevel: "low" | "medium" | "high" | "xhigh"
	readonly description: string
	readonly prompt: string
}

/**
 * Full spawn plan for a ulw-loop iteration.
 */
export interface UlwLoopSpawnPlan {
	readonly branches: readonly UlwLoopBranchSpawn[]
	readonly parallel: boolean
	readonly backgroundCount: number
	readonly foregroundCount: number
	readonly byCategory: Readonly<Record<string, number>>
}

/**
 * Default routing table. Callers can override per-category by passing
 * a merged `routes` object to {@link planBranchSpawns}.
 *
 * - explore / coding → background=true (long-running; orchestrator keeps working)
 * - quick / unspecified-low → background=false (cheap, foreground)
 * - ultrabrain / deep → sisyphus with high/xhigh reasoning
 * - writing / artistry → atlas
 * - visual-engineering → hephaestus
 * - reasoning → metis
 */
export const DEFAULT_CATEGORY_ROUTES: Readonly<Record<UlwLoopSpawnCategory, UlwLoopCategoryRoute>> = {
	explore: { category: "explore", subagentType: "explore", background: true, reasoningLevel: "low" },
	coding: { category: "coding", subagentType: "coding", background: true, reasoningLevel: "medium" },
	writing: { category: "writing", subagentType: "atlas", background: true, reasoningLevel: "low" },
	reasoning: { category: "reasoning", subagentType: "metis", background: true, reasoningLevel: "high" },
	"visual-engineering": {
		category: "visual-engineering",
		subagentType: "hephaestus",
		background: true,
		reasoningLevel: "medium",
	},
	quick: {
		category: "quick",
		subagentType: "sisyphus-junior",
		background: false,
		reasoningLevel: "low",
	},
	"unspecified-low": {
		category: "unspecified-low",
		subagentType: "sisyphus-junior",
		background: false,
		reasoningLevel: "low",
	},
	"unspecified-high": {
		category: "unspecified-high",
		subagentType: "sisyphus",
		background: true,
		reasoningLevel: "high",
	},
	artistry: { category: "artistry", subagentType: "atlas", background: true, reasoningLevel: "medium" },
	deep: { category: "deep", subagentType: "sisyphus", background: true, reasoningLevel: "high" },
	ultrabrain: {
		category: "ultrabrain",
		subagentType: "sisyphus",
		background: true,
		reasoningLevel: "xhigh",
	},
}

/**
 * Keyword → category rules. Order matters: first match wins, so the
 * more specific patterns must come first.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [RegExp, UlwLoopSpawnCategory]> = [
	[/implement|build|refactor|fix|patch|\bcode\b|function|class|module|endpoint|handler/i, "coding"],
	[/explore|investigate|discover|map\s+the|find|search|locate|understand|inspect/i, "explore"],
	[/document|docs?|draft|prose|write\s+up|readme|guide|walkthrough/i, "writing"],
	[/design|analy[sz]e|strategy|decide|plan\s+out|architect|reason\s+about/i, "reasoning"],
	[/frontend|front-end|\bui\b|\bux\b|css|styling|component\s+layout|visual/i, "visual-engineering"],
	[/typo|rename|bump|trivial|one[- ]liner|constant|version\s+bump/i, "quick"],
]

/** Threshold above which an uncategorized objective is treated as high-complexity. */
const UNSPECIFIED_HIGH_LENGTH_THRESHOLD = 200

/**
 * Categorize a single goal objective. Pure string classification —
 * no I/O, no globals. Exposed for testing and for callers that want
 * to categorize without producing a full spawn plan.
 */
export function categorizeGoalObjective(objective: string): UlwLoopSpawnCategory {
	for (const [pattern, category] of CATEGORY_KEYWORDS) {
		if (pattern.test(objective)) return category
	}
	return objective.length > UNSPECIFIED_HIGH_LENGTH_THRESHOLD ? "unspecified-high" : "unspecified-low"
}

/** Goals with these statuses are skipped by default (already resolved). */
const SKIPPED_STATUS = new Set(["complete", "failed"] as const)

export interface PlanBranchSpawnsOptions {
	readonly routes?: Readonly<Record<UlwLoopSpawnCategory, UlwLoopCategoryRoute>>
	readonly onlyGoalIds?: readonly string[]
	readonly includeComplete?: boolean
	readonly parallel?: boolean
}

export function planBranchSpawns(
	plan: UlwLoopPlan,
	options?: PlanBranchSpawnsOptions,
): UlwLoopSpawnPlan {
	const routes = options?.routes ?? DEFAULT_CATEGORY_ROUTES
	const parallel = options?.parallel ?? true
	const filterIds =
		options?.onlyGoalIds !== undefined ? new Set(options.onlyGoalIds) : null

	const branches: UlwLoopBranchSpawn[] = []

	for (const goal of plan.goals) {
		if (filterIds !== null && !filterIds.has(goal.id)) continue
		if (!options?.includeComplete) {
			if (goal.status && SKIPPED_STATUS.has(goal.status as (typeof SKIPPED_STATUS)[number])) continue
			if (goal.steeringStatus === "superseded") continue
		}

		const category = categorizeGoalObjective(goal.objective)
		const route = routes[category] ?? DEFAULT_CATEGORY_ROUTES[category]
		if (!route) {
			throw new Error(`No route for category '${category}' and no default available`)
		}

		branches.push({
			goalId: goal.id,
			goalTitle: goal.title,
			category,
			subagentType: route.subagentType,
			background: route.background,
			reasoningLevel: route.reasoningLevel,
			description: `ulw-loop ${category} branch: ${goal.title}`,
			prompt: buildSpawnPrompt(goal, category, route),
		})
	}

	const byCategory: Record<string, number> = {}
	for (const branch of branches) {
		byCategory[branch.category] = (byCategory[branch.category] ?? 0) + 1
	}
	const backgroundCount = branches.filter((b) => b.background).length

	return {
		branches,
		parallel,
		backgroundCount,
		foregroundCount: branches.length - backgroundCount,
		byCategory,
	}
}

function buildSpawnPrompt(
	goal: UlwLoopItem,
	category: UlwLoopSpawnCategory,
	route: UlwLoopCategoryRoute,
): string {
	const lines: string[] = [
		`ulw-loop branch ${goal.id} (${category})`,
		`Title: ${goal.title}`,
		`Objective: ${goal.objective}`,
		`Route: subagent_type=${route.subagentType}, reasoning=${route.reasoningLevel}, background=${route.background}`,
	]
	const criteria = goal.successCriteria
	if (criteria.length > 0) {
		lines.push("")
		lines.push(`Success criteria (${criteria.length}):`)
		for (const criterion of criteria) {
			lines.push(`- [${criterion.status}] ${criterion.id} (${criterion.userModel}): ${criterion.scenario}`)
		}
	}
	return lines.join("\n")
}
