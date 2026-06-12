import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("assert-npm-publish-auth integration (#22)", () => {
    test("exits 2 with npm login blockedReason when not authenticated", async () => {
        const script = join(ROOT, "scripts/assert-npm-publish-auth.mjs");
        try {
            await execFileAsync("node", [script], {
                cwd: ROOT,
                encoding: "utf8",
                env: { ...process.env, LFG_NPM_WHOAMI: "" },
            });
            expect.fail("expected exit 2");
        }
        catch (error) {
            const err = error;
            expect(err.code).toBe(2);
            const auth = JSON.parse(String(err.stdout));
            expect(auth.ok).toBe(false);
            expect(auth.npmUser).toBeNull();
            expect(String(auth.blockedReason)).toContain("npm login");
        }
    }, 15_000);
    test("npm run assert-publish-auth wires build then exits 2 when not logged in (#22)", async () => {
        try {
            await execFileAsync("npm", ["run", "assert-publish-auth"], {
                cwd: ROOT,
                encoding: "utf8",
                env: { ...process.env, LFG_NPM_WHOAMI: "" },
            });
            expect.fail("expected exit 2");
        }
        catch (error) {
            const err = error;
            expect(err.code).toBe(2);
            const combined = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
            expect(combined).toContain("build.mjs");
            expect(combined).toContain('"ok":false');
            expect(combined).toContain("npm login");
        }
    }, 60_000);
});
