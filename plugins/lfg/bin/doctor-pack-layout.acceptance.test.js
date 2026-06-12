import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "util";
import { describe, expect, test } from "vitest";
import { withNpmPackLock } from "./npm-pack-mutex";
import { resolveLfgCliLayout } from "./lfg-package-layout";
const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("packed CLI layout acceptance (#25)", () => {
    test("resolveLfgCliLayout from pack dist never uses bin/lfg.ts dev paths", async () => {
        const installRoot = await mkdtemp(join(tmpdir(), "lfg-doc25-layout-"));
        const distPath = join(installRoot, "plugins/lfg/dist/lfg.js");
        await mkdir(dirname(distPath), { recursive: true });
        await writeFile(join(installRoot, "package.json"), `${JSON.stringify({ name: "@islee23520/lfg", version: "0.1.4", bin: { lfg: "plugins/lfg/lfg" } })}\n`);
        await cp(join(ROOT, "plugins/lfg/dist/lfg.js"), distPath);
        const layout = await resolveLfgCliLayout(pathToFileURL(distPath).href);
        expect(layout.ok).toBe(true);
        expect(layout.layout).toBe("published-workspace");
        expect(layout.distEntry).toContain("dist/lfg.js");
        expect(layout.distEntry).not.toContain("bin/lfg.ts");
        expect(layout.packageRoot).toBe(installRoot);
    });
    test("npx lfg --json setup from local pack install uses the published workspace layout", async () => {
        const packDir = await mkdtemp(join(tmpdir(), "lfg-doc25-pack-"));
        const pack = await withNpmPackLock(() => execFileAsync("npm", ["pack", "--pack-destination", packDir, "--json"], { cwd: ROOT, encoding: "utf8" }));
        const packs = JSON.parse(pack.stdout);
        const tarball = join(packDir, packs[0]?.filename ?? "");
        const installDir = await mkdtemp(join(tmpdir(), "lfg-doc25-install-"));
        await execFileAsync("npm", ["init", "-y"], { cwd: installDir, encoding: "utf8" });
        await execFileAsync("npm", ["install", tarball], { cwd: installDir, encoding: "utf8", maxBuffer: 4_000_000 });
        const home = await mkdtemp(join(tmpdir(), "lfg-doc25-home-"));
        const setup = await execFileAsync("npx", ["lfg", "--json", "setup"], {
            cwd: installDir,
            encoding: "utf8",
            env: { ...process.env, HOME: home },
            maxBuffer: 2_000_000,
        });
        const json = JSON.parse(setup.stdout);
        expect(json.ok).toBe(true);
        expect(json.command).toBe("setup");
        expect(json.companionPackage).toBe("lfg-grok-install");
        expect(json.selectedPreset).toBe("gpt");
    }, 120_000);
});
