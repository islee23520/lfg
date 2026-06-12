import { describe, expect, test } from "vitest";
import { LFP_INSTALLER_COMMAND, LFP_INSTALLER_ARGS } from "./lfg-installer";
import { INTERNAL_GROK_INSTALL_COMMAND } from "../grok-install/run-grok-install";
describe("lfg-installer compat (#26)", () => {
    test("deprecated lfpInstaller fields alias internal grok install", () => {
        expect(LFP_INSTALLER_COMMAND).toBe(INTERNAL_GROK_INSTALL_COMMAND);
        expect(LFP_INSTALLER_ARGS).toEqual([]);
        expect(INTERNAL_GROK_INSTALL_COMMAND).toContain("internal grok-install");
        expect(INTERNAL_GROK_INSTALL_COMMAND).not.toContain("@islee23520/lfp");
    });
});
