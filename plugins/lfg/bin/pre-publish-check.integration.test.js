import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
describe("pre-publish-check integration (#22)", () => {
    test("exits 2 with gap.publishReady and auth blocked when not logged in", async () => {
        const script = join(ROOT, "scripts/pre-publish-check.mjs");
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
            const payload = JSON.parse(String(err.stdout));
            expect(payload.ready).toBe(false);
            expect(payload.ready).toBe(payload.gap.publishReady && payload.auth.ok);
            expect(payload.gap.hasBin).toBe(true);
            expect(payload.gap.publishReady).toBe(true);
            expect(payload.auth.ok).toBe(false);
            const gap = payload.gap;
            expect(gap.packageName).toBe("@islee23520/lfg");
            expect(gap.localVersion).toMatch(/^\d+\.\d+\.\d+$/);
            const rootPkg = JSON.parse(await (await import("node:fs/promises")).readFile(join(ROOT, "package.json"), "utf8"));
            expect(gap.localVersion).toBe(rootPkg.version);
            expect(gap.registryVersion).toMatch(/^\d+\.\d+\.\d+$|unavailable/);
            expect(payload.registryBin?.legacyWrongTarget).toBe(false);
            expect(payload.registryBin?.matchesPublishContract).toBe(true);
            expect(payload.registryBin?.binLfg).toBe("plugins/lfg/lfg");
            expect(payload.auth.blockedReason).toContain("npm login");
        }
    }, 30_000);
    test("npm run pre-publish-check wires build then exits 2 when not logged in (#22)", async () => {
        try {
            await execFileAsync("npm", ["run", "pre-publish-check"], {
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
            expect(combined).toContain('"hasBin": true');
            expect(combined).toContain('"publishReady": true');
            expect(combined).toContain('"legacyWrongTarget": false');
            expect(combined).toContain("plugins/lfg/lfg");
        }
    }, 60_000);
});
