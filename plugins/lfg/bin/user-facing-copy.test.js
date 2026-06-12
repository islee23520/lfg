import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
/** Epic #33 — ADR-aligned user-facing surfaces. */
describe("user-facing copy (#33)", () => {
    test("root package.json description is omo Grok adapter default path", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(pkg.description).toContain("Grok Build adapter");
        expect(pkg.description).toContain("grok-install");
        expect(pkg.description).not.toContain("npx @islee23520/lfp setup");
    });
    test("plugins/lfg README describes Grok-first install without Codex npx default", async () => {
        const readme = await readFile(join(ROOT, "plugins/lfg/README.md"), "utf8");
        expect(readme).toContain("~/.grok");
        expect(readme).toContain("installed-plugins/lfg");
        expect(readme).toContain("does **not** run `npx lazycodex-ai install`");
        expect(readme).toContain("언제 무엇을 실행하면 되나");
        expect(readme).not.toContain("npx @islee23520/lfp setup");
    });
    test("lfg skill documents purpose and setup rhythm for agents", async () => {
        const skill = await readFile(join(ROOT, "plugins/lfg/skills/lfg/SKILL.md"), "utf8");
        expect(skill).toContain("name: lfg");
        expect(skill).toContain("언제 어떤 명령");
        expect(skill).toContain("npx @islee23520/lfg setup");
        expect(skill).not.toContain("npx @islee23520/lfp setup");
    });
    test("canonical plan doc exists for ULW execution", async () => {
        const plan = await readFile(join(ROOT, "plans/lfg-omo-grok-adapter.md"), "utf8");
        expect(plan).toContain("runGrokInstall");
        expect(plan).toContain("lfgIsPlugin: false");
    });
    test("nested plugins/lfg package.json description matches omo adapter (no LFP default)", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "plugins/lfg/package.json"), "utf8"));
        expect(pkg.description).toContain("Grok Build adapter");
        expect(pkg.description).not.toContain("npx @islee23520/lfp setup");
    });
    test("grok-adapter-parity.md syncs core rows to Implemented (not pending)", async () => {
        const parity = await readFile(join(ROOT, "docs/grok-adapter-parity.md"), "utf8");
        expect(parity).toContain("grok-adapter-ownership.md");
        expect(parity).toMatch(/\| Plugin cache install \|.*\| Implemented/);
        expect(parity).toMatch(/\| Internal verifier \|.*\| Implemented/);
        expect(parity).toMatch(/\| ulw-loop \/ start-work skills \|.*\| Implemented/);
        expect(parity).toContain("project `.omo` ledger");
        expect(parity).not.toMatch(/\| Plugin cache install \|.*\| pending/);
        expect(parity).not.toMatch(/\| Internal verifier \|.*\| pending/);
    });
});
