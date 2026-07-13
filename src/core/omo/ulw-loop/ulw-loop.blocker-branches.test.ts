import { describe, expect, test } from "vitest"

import type { UlwLoopItem, UlwLoopPlan } from "./types.js"
import {
	classifyExternalAuthorizationBlocker,
	normalizeBlockerEvidence,
	sameBlockerOccurrences,
} from "./quality-gate-blockers.js"

describe("classifyExternalAuthorizationBlocker branch matrix", () => {
	test("returns null for empty / whitespace-only evidence", () => {
		expect(classifyExternalAuthorizationBlocker("")).toBeNull()
		expect(classifyExternalAuthorizationBlocker("   \t\n  ")).toBeNull()
	})

	test("returns null when AUTH signals are present but no MISSING signal", () => {
		expect(classifyExternalAuthorizationBlocker("token failure during run")).toBeNull()
		expect(classifyExternalAuthorizationBlocker("unauthorized request rejected")).toBeNull()
	})

	test("returns null when MISSING signals are present but no AUTH signal", () => {
		expect(classifyExternalAuthorizationBlocker("missing config file")).toBeNull()
		expect(classifyExternalAuthorizationBlocker("required field unset")).toBeNull()
	})

	test("classifies a non-GHCR auth+missing blocker as EXTERNAL_AUTHORIZATION_REQUIRED", () => {
		expect(classifyExternalAuthorizationBlocker("missing token permission")).toBe(
			"EXTERNAL_AUTHORIZATION_REQUIRED",
		)
	})

	test("classifies GHCR with only a 403 signal (no 401)", () => {
		const result = classifyExternalAuthorizationBlocker(
			"ghcr pull denied 403 forbidden read packages missing credential token",
		)
		expect(result).toContain("GHCR_PULL_ACCESS")
		expect(result).toContain("HTTP_403_NO_READ_PACKAGES")
		expect(result).not.toContain("HTTP_401")
	})

	test("classifies GHCR with both 401 and 403 signals, joined", () => {
		const result = classifyExternalAuthorizationBlocker(
			"ghcr 401 unauthorized anonymous pull 403 forbidden read packages missing token",
		)
		expect(result).toContain("HTTP_401_ANONYMOUS")
		expect(result).toContain("HTTP_403_NO_READ_PACKAGES")
		expect(result).toContain("+")
	})

	test("classifies GHCR with neither 401 nor 403 as the AUTHORIZATION_REQUIRED fallback", () => {
		const result = classifyExternalAuthorizationBlocker(
			"ghcr missing credential token",
		)
		expect(result).toBe("GHCR_PULL_ACCESS:AUTHORIZATION_REQUIRED:GHCR_VISIBILITY_OR_CREDENTIAL_REQUIRED")
	})
})

describe("normalizeBlockerEvidence", () => {
	test("strips urls, punctuation, and collapses whitespace into a trimmed lowercase token stream", () => {
		expect(normalizeBlockerEvidence('Auth "token" missing at https://x.io/a,b;c')).toBe(
			"auth token missing at",
		)
	})
})

describe("sameBlockerOccurrences nested-signature paths", () => {
	function planWith(goals: UlwLoopItem[]): UlwLoopPlan {
		return {
			version: 1,
			createdAt: "t",
			updatedAt: "t",
			briefPath: "b",
			goalsPath: "g",
			ledgerPath: "l",
			goals,
		}
	}

	function baseGoal(overrides: Partial<UlwLoopItem> = {}): UlwLoopItem {
		return {
			id: "G001",
			title: "t",
			objective: "o",
			status: "pending",
			successCriteria: [],
			attempt: 0,
			createdAt: "t",
			updatedAt: "t",
			...overrides,
		} as UlwLoopItem
	}

	test("counts a goal whose nested blocker.signature matches", () => {
		const plan = planWith([
			baseGoal({ blocker: { signature: "NESTED" } } as unknown as Partial<UlwLoopItem>),
		])
		expect(sameBlockerOccurrences(plan, "NESTED")).toBe(1)
	})

	test("does not match when blocker is present but not a record", () => {
		const plan = planWith([baseGoal({ blocker: "not-a-record" } as unknown as Partial<UlwLoopItem>)])
		expect(sameBlockerOccurrences(plan, "not-a-record")).toBe(0)
	})

	test("counts both top-level blockerSignature and nested matches across goals", () => {
		const plan = planWith([
			baseGoal({ blockerSignature: "SIG" }),
			baseGoal({ id: "G002", blocker: { signature: "SIG" } } as unknown as Partial<UlwLoopItem>),
			baseGoal({ id: "G003", blocker: "nope" } as unknown as Partial<UlwLoopItem>),
		])
		expect(sameBlockerOccurrences(plan, "SIG")).toBe(2)
	})
})
