import { describe, expect, test } from "vitest"

import { applyHashlineEdits, applyHashlineEditsWithReport } from "./edit-operations"
import { HashlineMismatchError } from "./validation"

// Anchors are omo ground truth: "alpha/beta/gamma" tag as 1#JN / 2#NK / 3#WB (Wave 1).
const CONTENT = "alpha\nbeta\ngamma"

describe("applyHashlineEdits", () => {
	test("replaces a single line when its anchor matches", () => {
		const out = applyHashlineEdits(CONTENT, [{ op: "replace", pos: "2#NK", lines: "BETA" }])
		expect(out).toBe("alpha\nBETA\ngamma")
	})

	test("inserts after an anchored line (append)", () => {
		const out = applyHashlineEdits(CONTENT, [{ op: "append", pos: "1#JN", lines: "after alpha" }])
		expect(out).toBe("alpha\nafter alpha\nbeta\ngamma")
	})

	test("appends to EOF when no pos anchor is given", () => {
		const out = applyHashlineEdits(CONTENT, [{ op: "append", lines: "omega" }])
		expect(out).toBe("alpha\nbeta\ngamma\nomega")
	})

	test("rejects a stale anchor atomically with HashlineMismatchError", () => {
		expect(() => applyHashlineEdits(CONTENT, [{ op: "replace", pos: "2#ZZ", lines: "x" }])).toThrow(
			HashlineMismatchError,
		)
	})

	test("applies multiple edits in one pass (descending so anchors stay valid)", () => {
		const out = applyHashlineEdits(CONTENT, [
			{ op: "replace", pos: "1#JN", lines: "ALPHA" },
			{ op: "replace", pos: "3#WB", lines: "GAMMA" },
		])
		expect(out).toBe("ALPHA\nbeta\nGAMMA")
	})
})

describe("applyHashlineEditsWithReport", () => {
	test("counts noop edits (replace with identical content) and passes dedup count", () => {
		const report = applyHashlineEditsWithReport(CONTENT, [
			{ op: "replace", pos: "1#JN", lines: "alpha" },
			{ op: "replace", pos: "2#NK", lines: "BETA" },
		])
		expect(report.content).toBe("alpha\nBETA\ngamma")
		expect(report.noopEdits).toBe(1)
		expect(report.deduplicatedEdits).toBe(0)
	})

	test("deduplicates identical repeated edits", () => {
		const report = applyHashlineEditsWithReport(CONTENT, [
			{ op: "replace", pos: "2#NK", lines: "BETA" },
			{ op: "replace", pos: "2#NK", lines: "BETA" },
		])
		expect(report.content).toBe("alpha\nBETA\ngamma")
		expect(report.deduplicatedEdits).toBe(1)
	})

	test("returns content unchanged with zero counts for no edits", () => {
		const report = applyHashlineEditsWithReport(CONTENT, [])
		expect(report).toEqual({ content: CONTENT, noopEdits: 0, deduplicatedEdits: 0 })
	})
})
