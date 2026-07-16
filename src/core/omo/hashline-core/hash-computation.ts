import { HASHLINE_DICT } from "./constants"
import { hashXxh32 } from "./xxhash32"

const RE_SIGNIFICANT = /[\p{L}\p{N}]/u

function computeNormalizedLineHash(lineNumber: number, normalizedContent: string): string {
	const stripped = normalizedContent
	const seed = RE_SIGNIFICANT.test(stripped) ? 0 : lineNumber
	const hash = hashXxh32(stripped, seed)
	const index = hash % 256
	return HASHLINE_DICT[index]!
}

export function computeLineHash(lineNumber: number, content: string): string {
	return computeNormalizedLineHash(lineNumber, content.replace(/\r/g, "").trimEnd())
}

export function formatHashLine(lineNumber: number, content: string): string {
	const hash = computeLineHash(lineNumber, content)
	return `${lineNumber}#${hash}|${content}`
}

export function formatHashLines(content: string): string {
	if (!content) return ""
	const lines = content.split("\n")
	return lines.map((line, index) => formatHashLine(index + 1, line)).join("\n")
}
