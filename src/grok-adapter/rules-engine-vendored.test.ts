import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  createAgentsMdCache,
  createContentHash,
  createRuleScanCache,
  findAgentsMdUp,
  findProjectRoot,
  findRuleFiles,
  getMatcherCacheStats,
  isDuplicateByContentHash,
  isDuplicateByRealPath,
  parseRuleFrontmatter,
  resetMatcherCache,
  shouldApplyRule,
} from "./rules-engine-vendored";

describe("rules-engine-vendored", () => {
  test("findAgentsMdUp walks upward within rootDir and rejects outside paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-rules-agents-"));
    const project = join(root, "project");
    const nested = join(project, "src", "feature");
    const outside = join(root, "outside");
    await mkdir(nested, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(project, "AGENTS.md"), "root agents", "utf8");
    await writeFile(join(project, "src", "AGENTS.md"), "src agents", "utf8");
    await writeFile(join(outside, "AGENTS.md"), "outside agents", "utf8");
    await symlink(join(outside, "AGENTS.md"), join(nested, "AGENTS.md"));

    const canonicalProject = await realpath(project);
    const cache = createAgentsMdCache();
    await expect(findAgentsMdUp({ startDir: nested, rootDir: project, cache })).resolves.toEqual([
      join(canonicalProject, "src", "AGENTS.md"),
    ]);
    await expect(findAgentsMdUp({ startDir: outside, rootDir: project, cache })).resolves.toEqual([]);
    await expect(findAgentsMdUp({ startDir: nested, rootDir: project, skipRoot: false })).resolves.toEqual([
      join(canonicalProject, "AGENTS.md"),
      join(canonicalProject, "src", "AGENTS.md"),
    ]);
  });

  test("discovers project and home rules with frontmatter parsing", async () => {
    const root = await mkdtemp(join(tmpdir(), "lfg-rules-find-"));
    const project = join(root, "project");
    const home = join(root, "home");
    const currentFile = join(project, "src", "app.ts");
    await mkdir(join(project, "src", ".omo", "rules"), { recursive: true });
    await mkdir(join(project, ".github"), { recursive: true });
    await mkdir(join(home, ".omo", "rules"), { recursive: true });
    await writeFile(join(project, "package.json"), "{}", "utf8");
    await writeFile(currentFile, "export {};\n", "utf8");
    await writeFile(
      join(project, "src", ".omo", "rules", "typescript.md"),
      "---\ndescription: TypeScript rule\nglobs: [src/**/*.ts]\n---\nUse TypeScript.\n",
      "utf8",
    );
    await writeFile(join(project, ".github", "copilot-instructions.md"), "Copilot instructions\n", "utf8");
    await writeFile(join(home, ".omo", "rules", "global.md"), "---\nalwaysApply: true\n---\nGlobal rule\n", "utf8");

    expect(findProjectRoot(currentFile)).toBe(project);
    const cache = createRuleScanCache();
    const candidates = findRuleFiles(project, home, currentFile, undefined, cache);
    expect(candidates.map((candidate) => candidate.source)).toEqual([
      ".omo/rules",
      ".github/copilot-instructions.md",
      "~/.omo/rules",
    ]);
    expect(cache.stats().candidateEntries).toBe(1);
    expect(cache.stats().directoryEntries).toBeGreaterThan(0);

    const parsed = parseRuleFrontmatter("---\ndescription: TypeScript rule\nglobs:\n  - src/**/*.ts\n---\nUse TypeScript.\n");
    expect(parsed).toEqual({
      metadata: { description: "TypeScript rule", globs: ["src/**/*.ts"] },
      body: "Use TypeScript.\n",
    });
  });

  test("shouldApplyRule matches current file paths and maintains matcher cache", () => {
    const root = "/repo";
    resetMatcherCache();
    expect(shouldApplyRule({ globs: ["src/**/*.ts", "!src/**/*.test.ts"] }, "/repo/src/app.ts", root)).toEqual({
      applies: true,
      reason: "glob: src/**/*.ts",
    });
    expect(shouldApplyRule({ globs: ["src/**/*.ts", "!src/**/*.test.ts"] }, "/repo/src/app.test.ts", root)).toEqual({
      applies: false,
    });
    expect(shouldApplyRule({ alwaysApply: true }, "/repo/README.md", root)).toEqual({ applies: true, reason: "alwaysApply" });
    expect(getMatcherCacheStats().entries).toBeGreaterThan(0);
  });

  test("content-hash and realpath duplicate helpers detect duplicates", () => {
    const firstHash = createContentHash("same rule body");
    const secondHash = createContentHash("same rule body");
    const contentHashes = new Set<string>([firstHash]);
    expect(secondHash).toBe(firstHash);
    expect(isDuplicateByContentHash(secondHash, contentHashes)).toBe(true);
    expect(isDuplicateByContentHash(createContentHash("different rule body"), contentHashes)).toBe(false);

    const realPaths = new Set<string>(["/repo/.omo/rules/a.md"]);
    expect(isDuplicateByRealPath("/repo/.omo/rules/a.md", realPaths)).toBe(true);
    expect(isDuplicateByRealPath("/repo/.omo/rules/b.md", realPaths)).toBe(false);
  });
});
