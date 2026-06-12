import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("scripts/record-publish-gap.mjs (#22)", () => {
    test("writes evidence under .omo/ulw-loop/evidence using evaluatePublishGap", async () => {
        const script = await readFile(join(ROOT, "scripts/record-publish-gap.mjs"), "utf8");
        expect(script).toContain("evaluatePublishGap");
        expect(script).toContain("ulw-loop/evidence");
        expect(script).toContain("publish-gap-");
        expect(script).toContain("isPublishedLfgBinTarget");
        expect(script).toContain("npm-publish-bin.js");
        expect(script).toContain("parseNpmRegistryVersion");
        expect(script).toContain("registryBinPublishContract");
        expect(script).toContain("npm-registry-bin.js");
        expect(script).toContain("registryBin");
        expect(script).toContain("bin: local.bin");
    });
});
