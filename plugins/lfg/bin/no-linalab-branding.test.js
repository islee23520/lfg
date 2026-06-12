import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const BIN = fileURLToPath(new URL(".", import.meta.url));
async function collectShipTs(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
            continue;
        }
        files.push(join(dir, entry.name));
    }
    return files;
}
describe("lfg bin branding (plan DoD)", () => {
    test("bin sources contain no linalab", async () => {
        const files = await collectShipTs(BIN);
        expect(files.length).toBeGreaterThan(5);
        for (const path of files) {
            const text = await readFile(path, "utf8");
            expect(text.toLowerCase()).not.toContain("linalab");
        }
    });
});
