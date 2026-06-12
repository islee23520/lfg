import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
describe("self-test.ts contract (#22)", () => {
    test("checks setup and rejects non-setup public commands", async () => {
        const path = join(fileURLToPath(new URL(".", import.meta.url)), "self-test.ts");
        const src = await readFile(path, "utf8");
        expect(src).toContain("internal grok-install");
        expect(src).toContain("internal grok-install");
        expect(src).toContain('["doctor"]');
        expect(src).toContain("dry-setup");
        expect(src).not.toContain("@islee23520/lfp");
    });
});
