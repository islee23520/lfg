import { describe, expect, test } from "vitest";
import { parseNpmRegistryVersion } from "./npm-registry-version";
describe("npm-registry-version", () => {
    test("parses semver line", () => {
        expect(parseNpmRegistryVersion("0.1.3\n")).toBe("0.1.3");
    });
    test("rejects garbage", () => {
        expect(parseNpmRegistryVersion("")).toBeNull();
    });
    test("parses first line when extra whitespace (#22)", () => {
        expect(parseNpmRegistryVersion("  0.1.4  \n")).toBe("0.1.4");
    });
});
