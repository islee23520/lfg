import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("npm publish gates (#22)", () => {
    test("prepublishOnly runs npm test; no postinstall hook on root package", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(pkg.scripts?.prepublishOnly).toBe("npm test");
        expect(pkg.scripts?.prepack).toContain("build");
        expect(pkg.scripts).not.toHaveProperty("postinstall");
    });
    test("verify chains assert-pack before test (#22)", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        const verify = pkg.scripts?.verify ?? "";
        expect(verify).toBe("npm run assert-pack && npm test && npm run typecheck && npm run self-test");
    });
    test("scoped package name matches evaluatePublishGap default", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(pkg.name).toBe("@islee23520/lfg");
    });
    test("root files allowlist publishes bin shim and dist not nested workspace package.json (#22)", async () => {
        const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(pkg.bin?.lfg).toBe("plugins/lfg/lfg");
        expect(pkg.files).toContain("plugins/lfg/lfg");
        expect(pkg.files).toContain("plugins/lfg/dist");
        expect(pkg.files).not.toContain("plugins/lfg/package.json");
        expect(pkg.files).toHaveLength(5);
    });
});
