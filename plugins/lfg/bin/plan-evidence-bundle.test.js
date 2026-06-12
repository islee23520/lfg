import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const BUNDLE = join(ROOT, ".omo/plan-evidence/lfg-omo-grok-adapter.json");
describe(".omo/plan-evidence/lfg-omo-grok-adapter.json (#35)", () => {
    test("bundle references canonical plan and epic without secrets", async () => {
        const raw = await readFile(BUNDLE, "utf8");
        expect(raw).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
        expect(raw).not.toContain("api_key");
        const bundle = JSON.parse(raw);
        expect(bundle.planPath).toBe("plans/lfg-omo-grok-adapter.md");
        expect(bundle.epicIssue).toBe(26);
        expect(Array.isArray(bundle.evidence)).toBe(true);
        expect(bundle.evidence.length).toBeGreaterThan(0);
        expect(bundle.evidence.every((p) => p.startsWith(".omo/"))).toBe(true);
        expect(bundle.evidenceManifest).toMatch(/^\.omo\/ulw-loop\/evidence\//);
        const git = bundle.git;
        expect(git?.mainHead).toMatch(/^[0-9a-f]{7,40}$/);
        expect(String(bundle.openForPublish)).toContain("#22");
        expect(String(bundle.openForPublish)).toMatch(/0\.1\.4|npm publish/);
        expect(bundle.parityDoD).toContain("grok-adapter-parity-dod");
        expect(bundle.status).toBe("completed");
        expect(bundle.roadmapOpenIssues).toBe(0);
        expect(String(bundle.registryGap)).toContain("0.1.3");
    });
});
