import { readdir, readFile } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import * as ts from "typescript"
import { describe, expect, test } from "vitest"

type SourceText = {
  readonly path: string
  readonly content: string
}

type ImportReference = {
  readonly specifier: string
  readonly line: number
}

type BoundaryViolation = {
  readonly sourcePath: string
  readonly specifier: string
  readonly bannedRoot: string
  readonly line: number
}

const REPO_ROOT = resolve(process.cwd())
const CORE_ROOT = join(REPO_ROOT, "src", "core")

const BANNED_IMPORT_ROOTS = [
  "src/grok/assets",
  "src/grok/fixture",
  "src/grok/flavour",
  "src/grok/skills",
  "src/grok/supplemental-skills",
  "src/grok",
  "src/cli",
  "dist",
  "components",
  "skills",
] as const

async function listTypeScriptFiles(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listTypeScriptFiles(absolutePath)))
      continue
    }

    if (entry.isFile() && absolutePath.endsWith(".ts")) {
      files.push(absolutePath)
    }
  }

  return files.sort()
}

async function readSources(filePaths: readonly string[]): Promise<readonly SourceText[]> {
  return Promise.all(
    filePaths.map(async (filePath) => ({
      path: filePath,
      content: await readFile(filePath, "utf8"),
    })),
  )
}

function collectImportReferences(source: SourceText): readonly ImportReference[] {
  const parsed = ts.createSourceFile(source.path, source.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const references: ImportReference[] = []

  function recordStringModuleSpecifier(moduleSpecifier: ts.Expression | undefined): void {
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) {
      return
    }

    references.push({
      specifier: moduleSpecifier.text,
      line: parsed.getLineAndCharacterOfPosition(moduleSpecifier.getStart(parsed)).line + 1,
    })
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      recordStringModuleSpecifier(node.moduleSpecifier)
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      recordStringModuleSpecifier(node.arguments[0])
    }

    ts.forEachChild(node, visit)
  }

  visit(parsed)
  return references
}

function toRepoRelativePath(pathName: string): string {
  return relative(REPO_ROOT, pathName).replaceAll("\\", "/")
}

function normalizeSpecifierTarget(sourcePath: string, specifier: string): string {
  if (specifier.startsWith(".")) {
    return toRepoRelativePath(resolve(join(sourcePath, ".."), specifier))
  }

  return specifier.replaceAll("\\", "/")
}

function importRootForTarget(target: string): string | undefined {
  return BANNED_IMPORT_ROOTS.find((root) => target === root || target.startsWith(`${root}/`))
}

function findBoundaryViolations(sources: readonly SourceText[]): readonly BoundaryViolation[] {
  const violations: BoundaryViolation[] = []

  for (const source of sources) {
    for (const reference of collectImportReferences(source)) {
      const target = normalizeSpecifierTarget(source.path, reference.specifier)
      const bannedRoot = importRootForTarget(target)

      if (bannedRoot !== undefined) {
        violations.push({
          sourcePath: toRepoRelativePath(source.path),
          specifier: reference.specifier,
          bannedRoot,
          line: reference.line,
        })
      }
    }
  }

  return violations
}

describe("core dependency boundary", () => {
  test("keeps src/core TypeScript files independent from Grok, CLI, dist, and payload roots", async () => {
    // Given: the current src/core TypeScript files on disk.
    const files = await listTypeScriptFiles(CORE_ROOT)
    const sources = await readSources(files)

    // When: imports are resolved relative to the repository root.
    const violations = findBoundaryViolations(sources)

    // Then: no core file imports adapter, CLI, generated, or payload-owned roots.
    expect(violations).toEqual([])
  })

  test("rejects relative imports that step from core into the Grok adapter", () => {
    // Given: an in-memory core file with a Grok-style relative adapter import.
    const source: SourceText = {
      path: join(REPO_ROOT, "src", "core", "example.ts"),
      content: 'import { runGrokInstall } from "../grok/install/run-grok-install"\n',
    }

    // When: the boundary guard checks imports without writing the fixture to disk.
    const violations = findBoundaryViolations([source])

    // Then: the guard reports the adapter dependency as a violation.
    expect(violations).toEqual([
      {
        sourcePath: "src/core/example.ts",
        specifier: "../grok/install/run-grok-install",
        bannedRoot: "src/grok",
        line: 1,
      },
    ])
  })
})
