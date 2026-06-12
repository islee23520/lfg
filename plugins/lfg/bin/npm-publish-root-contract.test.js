import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PUBLISHED_LFG_BIN_TARGET } from "./npm-publish-bin";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
/** #22 — publish contract: root tarball is @islee23520/lfg, not nested plugins/lfg workspace package. */
describe("npm publish root contract (#22)", () => {
    test("root package is publish surface with bin on root package.json only", async () => {
        const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        expect(root.name).toBe("@islee23520/lfg");
        expect(root.bin?.lfg).toBe(PUBLISHED_LFG_BIN_TARGET);
        expect(root.workspaces).toContain("plugins/lfg");
    });
    test("nested plugins/lfg package.json uses workspace dev bin path not root shim", async () => {
        const root = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
        const nested = JSON.parse(await readFile(join(ROOT, "plugins/lfg/package.json"), "utf8"));
        expect(nested.bin?.lfg).toBe("lfg");
        expect(root.bin?.lfg).toBe("plugins/lfg/lfg");
        expect(nested.bin?.lfg).not.toBe(root.bin?.lfg);
        const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8");
        expect(doc).toContain("not `plugins/lfg` alone");
        expect(doc).toContain("workspace dev only");
    });
    test("docs/npm-publish.md forbids workspace-only publish that caused #22", async () => {
        const doc = await readFile(join(ROOT, "docs/npm-publish.md"), "utf8");
        expect(doc).toContain("repository root");
        expect(doc).toContain("could not determine executable");
        expect(doc).toContain("fileCount");
    });
});
