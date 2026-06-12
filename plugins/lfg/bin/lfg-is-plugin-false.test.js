import { describe, expect, test } from "vitest";
import { runLfg } from "./test-process";
describe("lfgIsPlugin ownership (plan DoD)", () => {
    test("setup plan JSON sets lfgIsPlugin false", async () => {
        const plan = await runLfg(["--json", "setup"], {});
        expect(plan.json).toMatchObject({ lfgIsPlugin: false });
    });
    test("unsupported legacy commands still identify lfg as an adapter installer", async () => {
        const result = await runLfg(["--json", "doctor"], {});
        expect(result.json).toMatchObject({ lfgIsPlugin: false, command: "doctor", supportedCommands: ["setup"] });
    });
});
