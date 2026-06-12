import { describe, expect, test } from "vitest";
import { LFG_OWNED_GROK_CONFIG_SECTIONS } from "./lfg-grok-config";
describe("LFG_OWNED_GROK_CONFIG_SECTIONS (#29)", () => {
    test("documents all managed config.toml areas", () => {
        expect(LFG_OWNED_GROK_CONFIG_SECTIONS).toContain("endpoints.models_base_url");
        expect(LFG_OWNED_GROK_CONFIG_SECTIONS).toContain("lazycodex.models");
        expect(LFG_OWNED_GROK_CONFIG_SECTIONS.length).toBeGreaterThanOrEqual(5);
        expect(LFG_OWNED_GROK_CONFIG_SECTIONS.join(" ")).not.toContain("api_key");
    });
});
