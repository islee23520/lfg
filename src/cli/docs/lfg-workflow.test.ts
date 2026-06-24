import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const ROOT = fileURLToPath(new URL("../../../", import.meta.url))

describe(".github/workflows/lfg.yml (#12 / epic #26)", () => {
  test("verify job runs npm run verify on Node 22", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/lfg.yml"), "utf8")
    expect(yaml).toContain('node-version: "22"')
    expect(yaml).toContain("npm run verify")
    expect(yaml).toContain("assert-pack")
    expect(yaml).toContain("OMO parity")
    expect(yaml).toContain("npm ci")
    expect(yaml).not.toContain("bun ")
    expect(yaml).not.toContain("oven-sh/setup-bun")
  })

  test("workflow gates on pull_request and push to main, and on v* tags", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/lfg.yml"), "utf8")
    expect(yaml).toContain("pull_request:")
    expect(yaml).toMatch(/branches:\s*\[main\]/)
    expect(yaml).toContain('tags:')
    expect(yaml).toContain('"v*"')
    expect(yaml).toContain("workflow_dispatch:")
    expect(yaml).toContain("concurrency:")
    expect(yaml).not.toContain("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24")
  })

  test("publish job runs only on v* tags after verify, publishing to npm", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/lfg.yml"), "utf8")
    expect(yaml).toContain("needs: verify")
    expect(yaml).toContain("if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')")
    expect(yaml).toContain("npm publish --access public")
    expect(yaml).toContain("NPM_TOKEN")
    expect(yaml).toContain("NODE_AUTH_TOKEN")
    expect(yaml).toContain("registry-url: https://registry.npmjs.org")
  })

  test("publish job guards package and lockfile versions against the tag", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/lfg.yml"), "utf8")
    expect(yaml).toContain("GITHUB_REF_NAME")
    expect(yaml).toContain("package.json")
    expect(yaml).toContain("package-lock.json")
    expect(yaml).toContain('package-lock.json packages[""]')
    expect(yaml).toContain("process.exit(1)")
  })

  test("publish job creates a GitHub Release on success", async () => {
    const yaml = await readFile(join(ROOT, ".github/workflows/lfg.yml"), "utf8")
    expect(yaml).toContain("softprops/action-gh-release@v2")
    expect(yaml).toContain("generate_release_notes: true")
  })
})
