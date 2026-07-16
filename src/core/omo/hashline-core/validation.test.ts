import { describe, expect, test } from "vitest"

import { computeLineHash } from "./hash-computation"
import {
	HashlineMismatchError,
	normalizeLineRef,
	parseLineRef,
	validateLineRef,
	validateLineRefs,
} from "./validation"

// Hash vectors here are ground truth captured from omo's own impl (bun -e): line 1 "hello world" -> MM, line 2 "second line" -> VW.
const LINES = ["hello world", "second line", "third"]

describe("parseLineRef", () => {
	test("parses a well-formed N#XX ref into {line, hash}", () => {
		expect(parseLineRef("1#MM")).toEqual({ line: 1, hash: "MM" })
	})

	test("rejects non-ref garbage with the format error", () => {
		expect(() => parseLineRef("garbage")).toThrow(/Invalid line reference format/)
	})

	test("rejects a non-numeric line prefix with the not-a-line-number hint", () => {
		expect(() => parseLineRef("abc#MM")).toThrow(/"abc" is not a line number/)
	})
})

describe("normalizeLineRef", () => {
	test("strips a >>> prefix, spaces around #, and a trailing |content", () => {
		const h2 = computeLineHash(2, LINES[1]!)
		expect(normalizeLineRef(`>>> 2 # ${h2} | second line  `)).toBe(`2#${h2}`)
	})

	test("extracts an embedded N#XX when surrounded by noise", () => {
		expect(normalizeLineRef("see 1#MM above")).toBe("1#MM")
	})
})

describe("validateLineRef", () => {
	test("accepts a ref whose hash matches the current line content", () => {
		expect(() => validateLineRef(LINES, "1#MM")).not.toThrow()
	})

	test("throws HashlineMismatchError when the anchor is stale (line moved/changed)", () => {
		try {
			validateLineRef(LINES, "1#ZZ")
			throw new Error("expected validateLineRef to throw")
		} catch (error) {
			expect(error).toBeInstanceOf(HashlineMismatchError)
			expect((error as Error).message).toMatch(/changed since last read/)
			expect((error as Error).message).toMatch(/>>>/)
		}
	})

	test("throws out-of-bounds for a line number past the file end", () => {
		expect(() => validateLineRef(LINES, "99#MM")).toThrow(/out of bounds/)
	})
})

describe("validateLineRefs", () => {
	test("passes when every ref matches", () => {
		const refs = [`1#${computeLineHash(1, LINES[0]!)}`, `2#${computeLineHash(2, LINES[1]!)}`]
		expect(() => validateLineRefs(LINES, refs)).not.toThrow()
	})

	test("throws HashlineMismatchError if any single ref is stale", () => {
		const refs = [`1#${computeLineHash(1, LINES[0]!)}`, "2#ZZ"]
		expect(() => validateLineRefs(LINES, refs)).toThrow(HashlineMismatchError)
	})
})
