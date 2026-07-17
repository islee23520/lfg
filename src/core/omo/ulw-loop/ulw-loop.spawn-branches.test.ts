import { describe, expect, test } from "vitest"
import {
	DEFAULT_CATEGORY_ROUTES,
	categorizeGoalObjective,
	planBranchSpawns,
	type UlwLoopSpawnCategory,
} from "./spawn-branches.js"
import type { UlwLoopItem, UlwLoopPlan } from "./domain-types.js"

function makeGoal(
	overrides: Partial<UlwLoopItem> & { id: string; title: string; objective: string },
): UlwLoopItem {
	return {
		status: "pending",
		successCriteria: [],
		attempt: 0,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...overrides,
	}
}

function makePlan(goals: UlwLoopItem[]): UlwLoopPlan {
	return {
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		briefPath: ".omo/ulw-loop/brief.md",
		goalsPath: ".omo/ulw-loop/goals.json",
		ledgerPath: ".omo/ulw-loop/ledger.jsonl",
		goals,
	}
}

describe("categorizeGoalObjective", () => {
	test("coding: implement/build/refactor/fix", () => {
		expect(categorizeGoalObjective("Implement validateEmail in src/auth")).toBe("coding")
		expect(categorizeGoalObjective("Refactor database layer for transactions")).toBe("coding")
		expect(categorizeGoalObjective("Fix the off-by-one in parser")).toBe("coding")
	})
	test("explore: investigate/discover/map/find", () => {
		expect(categorizeGoalObjective("Investigate memory leak in worker pool")).toBe("explore")
		expect(categorizeGoalObjective("Map the dependency graph")).toBe("explore")
	})
	test("writing: docs/prose/draft", () => {
		expect(categorizeGoalObjective("Document the setup workflow")).toBe("writing")
		expect(categorizeGoalObjective("Draft README")).toBe("writing")
	})
	test("reasoning: design/analyze/strategy", () => {
		expect(categorizeGoalObjective("Design the auth architecture")).toBe("reasoning")
		expect(categorizeGoalObjective("Analyze performance bottleneck")).toBe("reasoning")
	})
	test("visual-engineering: frontend/UI/CSS", () => {
		expect(categorizeGoalObjective("Frontend form validation UI")).toBe("visual-engineering")
		expect(categorizeGoalObjective("CSS layout for dashboard")).toBe("visual-engineering")
	})
	test("quick: typo/rename/bump", () => {
		expect(categorizeGoalObjective("Rename foo to bar everywhere")).toBe("quick")
		expect(categorizeGoalObjective("Bump version to 1.2.3")).toBe("quick")
	})
	test("fallback: unspecified-low for short unknown", () => {
		expect(categorizeGoalObjective("Ship feature")).toBe("unspecified-low")
	})
	test("fallback: unspecified-high for long unknown (>200 chars)", () => {
		const long = "x".repeat(250)
		expect(categorizeGoalObjective(long)).toBe("unspecified-high")
	})
})

describe("planBranchSpans", () => {
	test("empty plan returns empty spawn plan", () => {
		const result = planBranchSpawns(makePlan([]))
		expect(result.branches).toEqual([])
		expect(result.backgroundCount).toBe(0)
		expect(result.foregroundCount).toBe(0)
		expect(result.byCategory).toEqual({})
	})

	test("skips complete and superseded goals by default", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "Done", objective: "Implement X", status: "complete" }),
			makeGoal({ id: "G002", title: "Superseded", objective: "Investigate Y", steeringStatus: "superseded" }),
			makeGoal({ id: "G003", title: "Active", objective: "Build Z" }),
		])
		const result = planBranchSpawns(plan)
		expect(result.branches.map((b) => b.goalId)).toEqual(["G003"])
	})

	test("includeComplete flag lifts the skip", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "Done", objective: "Implement X", status: "complete" }),
			makeGoal({ id: "G002", title: "Active", objective: "Build Z" }),
		])
		const result = planBranchSpawns(plan, { includeComplete: true })
		expect(result.branches.map((b) => b.goalId)).toEqual(["G001", "G002"])
	})

	test("categorizes each goal and maps to default subagent type", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "Coding", objective: "Implement the auth module" }),
			makeGoal({ id: "G002", title: "Explore", objective: "Investigate memory leak" }),
			makeGoal({ id: "G003", title: "Writing", objective: "Document the API" }),
		])
		const result = planBranchSpawns(plan)
		expect(result.branches).toHaveLength(3)

		const coding = result.branches.find((b) => b.goalId === "G001")!
		expect(coding.category).toBe("coding")
		expect(coding.subagentType).toBe("coding")
		expect(coding.background).toBe(true)
		expect(coding.reasoningLevel).toBe("medium")

		const explore = result.branches.find((b) => b.goalId === "G002")!
		expect(explore.category).toBe("explore")
		expect(explore.subagentType).toBe("explore")

		const writing = result.branches.find((b) => b.goalId === "G003")!
		expect(writing.subagentType).toBe("atlas")
	})

	test("byCategory counts group correctly", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "C1", objective: "Implement A" }),
			makeGoal({ id: "G002", title: "C2", objective: "Implement B" }),
			makeGoal({ id: "G003", title: "E1", objective: "Investigate C" }),
		])
		const result = planBranchSpawns(plan)
		expect(result.byCategory).toEqual({ coding: 2, explore: 1 })
	})

	test("background vs foreground split reflects routes", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "Coding", objective: "Implement X" }),
			makeGoal({ id: "G002", title: "Quick", objective: "Rename foo" }),
		])
		const result = planBranchSpawns(plan)
		expect(result.backgroundCount).toBe(1)
		expect(result.foregroundCount).toBe(1)
	})

	test("onlyGoalIds filters to subset", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "A", objective: "Implement A" }),
			makeGoal({ id: "G002", title: "B", objective: "Implement B" }),
			makeGoal({ id: "G003", title: "C", objective: "Implement C" }),
		])
		const result = planBranchSpawns(plan, { onlyGoalIds: ["G001", "G003"] })
		expect(result.branches.map((b) => b.goalId)).toEqual(["G001", "G003"])
	})

	test("custom routes override defaults", () => {
		const plan = makePlan([
			makeGoal({ id: "G001", title: "Coding", objective: "Implement X" }),
		])
		const customRoutes = {
			...DEFAULT_CATEGORY_ROUTES,
			coding: {
				category: "coding" as const,
				subagentType: "hephaestus",
				background: false,
				reasoningLevel: "xhigh" as const,
			},
		}
		const result = planBranchSpawns(plan, { routes: customRoutes })
		expect(result.branches[0]!.subagentType).toBe("hephaestus")
		expect(result.branches[0]!.background).toBe(false)
		expect(result.branches[0]!.reasoningLevel).toBe("xhigh")
		expect(result.backgroundCount).toBe(0)
		expect(result.foregroundCount).toBe(1)
	})

	test("spawn prompt includes goal id, category, criteria count, and criterion rows", () => {
		const plan = makePlan([
			makeGoal({
				id: "G001",
				title: "Coding task",
				objective: "Implement X",
				successCriteria: [
					{
						id: "C001",
						scenario: "happy path",
						userModel: "happy",
						expectedEvidence: "test passes",
						capturedEvidence: null,
						status: "pending",
					},
				],
			}),
		])
		const result = planBranchSpawns(plan)
		const prompt = result.branches[0]!.prompt
		expect(prompt).toContain("G001")
		expect(prompt).toContain("coding")
		expect(prompt).toContain("Success criteria (1)")
		expect(prompt).toContain("C001")
	})

	test("DEFAULT_CATEGORY_ROUTES covers every category enum value", () => {
		const categories: UlwLoopSpawnCategory[] = [
			"explore",
			"coding",
			"writing",
			"reasoning",
			"visual-engineering",
			"quick",
			"unspecified-low",
			"unspecified-high",
			"artistry",
			"deep",
			"ultrabrain",
		]
		for (const cat of categories) {
			expect(DEFAULT_CATEGORY_ROUTES[cat]).toBeDefined()
			expect(DEFAULT_CATEGORY_ROUTES[cat]!.subagentType).toBeTruthy()
			expect(typeof DEFAULT_CATEGORY_ROUTES[cat]!.background).toBe("boolean")
		}
	})

	test("parallel flag defaults true, passes through", () => {
		const plan = makePlan([makeGoal({ id: "G001", title: "X", objective: "Implement X" })])
		expect(planBranchSpawns(plan).parallel).toBe(true)
		expect(planBranchSpawns(plan, { parallel: false }).parallel).toBe(false)
	})
})
