import { parseFrontmatter, type RuleFrontmatterData } from "./parser-utils";
import type { RuleFrontmatterResult } from "./types";

export function parseRuleFrontmatter(content: string): RuleFrontmatterResult {
  const parsed = parseFrontmatter<RuleFrontmatterData>(content, { mode: "rule" });
  return { metadata: parsed.data, body: parsed.body };
}
