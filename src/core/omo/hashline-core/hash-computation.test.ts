import { describe, expect, test } from "vitest"

import {
	computeLineHash,
	formatHashLine,
	formatHashLines,
} from "./hash-computation"

describe("hashline hash-computation (vectors grounded in omo reference impl)", () => {
	test("computeLineHash reproduces omo anchors for content lines (seed 0)", () => {
		expect(computeLineHash(1, "hello world")).toBe("MM")
		expect(computeLineHash(2, "export function foo() { return 42; }")).toBe("BM")
		expect(computeLineHash(5, "line with unicode café ☕")).toBe("QR")
	})

	test("whitespace-only / empty lines seed with the line number (position-dependent)", () => {
		expect(computeLineHash(3, "   ")).toBe("HW")
		expect(computeLineHash(4, "")).toBe("RW")
	})

	test("computeLineHash normalizes trailing CR and trailing whitespace before hashing", () => {
		expect(computeLineHash(1, "hello world\r")).toBe("MM")
		expect(computeLineHash(1, "hello world   ")).toBe("MM")
	})

	test("formatHashLine emits the lineNumber#hash|content anchor line", () => {
		expect(formatHashLine(1, "hello world")).toBe("1#MM|hello world")
		expect(formatHashLine(4, "")).toBe("4#RW|")
	})

	test("formatHashLines tags every line 1-indexed", () => {
		expect(formatHashLines("alpha\nbeta\ngamma")).toBe(
			"1#JN|alpha\n2#NK|beta\n3#WB|gamma",
		)
	})

	test("formatHashLines on empty content returns empty string", () => {
		expect(formatHashLines("")).toBe("")
	})
})
