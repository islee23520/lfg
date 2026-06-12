import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runGrokDoctor } from "../grok-install/doctor";
import { runLfg } from "./test-process";
/** #21: setup JSON must not disagree with doctor on install surface after successful install. */
describe("setup vs doctor install surface (#21)", () => {
    test("postInstallVerify verified matches doctor installSurface.ok", async () => {
        const home = await mkdtemp(join(tmpdir(), "lfg-setup-doc-parity-"));
        const setup = await runLfg(["--json", "setup", "--run"], { HOME: home });
        expect(setup.exitCode).toBe(0);
        const setupJson = setup.json;
        expect(setupJson.ok).toBe(true);
        expect(setupJson.postInstallVerify).toMatchObject({ ok: true, status: "verified" });
        const doctor = await runGrokDoctor({ home });
        const installSurface = doctor.installSurface;
        expect(installSurface.ok).toBe(true);
        expect(installSurface.status).toBe("verified");
        expect(doctor.ok).toBe(true);
    });
});
