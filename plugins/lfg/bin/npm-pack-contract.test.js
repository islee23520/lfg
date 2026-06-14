import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { withNpmPackLock } from "./npm-pack-mutex";
const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("npm pack contract (#22)", () => {
    test("dry-run ships bin at root package.json path, not nested plugins/lfg/package.json", async () => {
        const { stdout } = await withNpmPackLock(() => execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" }));
        const packs = JSON.parse(stdout);
        const paths = packs.flatMap((p) => p.files?.map((f) => f.path).filter((x) => typeof x === "string") ?? []);
        expect(paths).toContain("package.json");
        expect(paths).toContain("plugins/lfg/lfg");
        expect(paths).toContain("plugins/lfg/dist/lfg.js");
        expect(paths).toContain("plugins/lfg/dist/self-test.js");
        expect(paths).toContain("plugins/lfg/README.md");
        expect(paths).toContain("plugins/lfg/AGENTS.md");
        expect(paths.some((p) => p.startsWith("plugins/lfg/skills/"))).toBe(true);
        expect(paths).not.toContain("plugins/lfg/package.json");
        expect(paths).not.toContain("plugins/lfg/bin/lfg.ts");
        expect(paths.length).toBeLessThanOrEqual(50);
        expect(paths.length).toBeLessThan(100);
        expect(paths).toContain("plugins/lfg/dist/npm-publish-auth.js");
        expect(paths).toContain("plugins/lfg/dist/npm-registry-version.js");
        expect(paths).toContain("plugins/lfg/dist/npm-publish-bin.js");
        expect(paths).toContain("plugins/lfg/dist/npm-registry-bin.js");
        expect(paths).toContain("plugins/lfg/dist/publish-readiness.js");
        expect(paths).toContain("plugins/lfg/dist/grok-install/fixture-minimal/hooks/hooks.json");
        // T5 contract: force native Grok hook + bridge fallback + OMO skill workflow payloads in pack (failing-first)
        expect(paths.some((p) => p.includes("lfg-grok-hook-bridge.mjs") || p.includes("hook-bridge"))).toBe(true);
        expect(paths.some((p) => p.startsWith("plugins/lfg/skills/") && (p.includes("ulw") || p.includes("ultrawork")))).toBe(true);
        expect(paths).toContain("plugins/lfg/dist/grok-install/assets/lfg-grok-hook-bridge.mjs"); // bridge fallback surface
    });
    test("dry-run pack filename uses scoped package name and semver (#22)", async () => {
        const { stdout } = await withNpmPackLock(() => execFileAsync("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" }));
        const packs = JSON.parse(stdout);
        const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(packs[0]?.filename).toMatch(new RegExp(`islee23520-lfg-${root.version.replace(/\./g, "\\.")}\\.tgz`));
    });
    test("root package.json bin.lfg points at shim under plugins/lfg", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg");
        expect(pkg.files).toContain("plugins/lfg/lfg");
        expect(pkg.files).toContain("plugins/lfg/dist");
    });
});
