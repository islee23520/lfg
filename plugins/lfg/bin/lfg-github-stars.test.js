import { describe, expect, test } from "vitest";
import { githubStarApiArgs } from "./lfg-github-stars";
describe("GitHub star helper", () => {
    test("uses gh api endpoint because gh repo star is not available in older GitHub CLI versions", () => {
        expect(githubStarApiArgs("code-yeongyu/oh-my-openagent")).toEqual([
            "api",
            "--method",
            "PUT",
            "--silent",
            "/user/starred/code-yeongyu/oh-my-openagent",
        ]);
    });
});
