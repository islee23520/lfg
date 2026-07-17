import { readFileSync } from "node:fs"
import { planBranchSpawns } from "../src/core/omo/ulw-loop/spawn-branches.js"

const planPath = process.argv[2]
if (!planPath) {
	console.error("usage: npx tsx scripts/spawn-branches-surface.mjs <plan.json>")
	process.exit(2)
}
const plan = JSON.parse(readFileSync(planPath, "utf8"))
const result = planBranchSpawns(plan)
const summary = {
	planPath,
	totalGoals: plan.goals.length,
	schedulableBranches: result.branches.length,
	parallel: result.parallel,
	backgroundCount: result.backgroundCount,
	foregroundCount: result.foregroundCount,
	byCategory: result.byCategory,
	branches: result.branches.map((b) => ({
		goalId: b.goalId,
		category: b.category,
		subagentType: b.subagentType,
		background: b.background,
		reasoningLevel: b.reasoningLevel,
	})),
}
console.log(JSON.stringify(summary, null, 2))
