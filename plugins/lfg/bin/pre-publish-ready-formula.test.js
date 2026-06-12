import { describe, expect, test } from "vitest";
import { evaluateNpmPublishAuth } from "./npm-publish-auth";
import { evaluatePublishGap } from "./publish-readiness";
/** #22 — pre-publish-check `ready` gate matches gap + auth composition. */
describe("pre-publish ready formula (#22)", () => {
    test("ready when publishReady and auth ok", () => {
        const gap = evaluatePublishGap({
            packageName: "@islee23520/lfg",
            localVersion: "0.1.4",
            registryVersion: "0.1.3",
            hasBin: true,
        });
        const auth = evaluateNpmPublishAuth("islee23520");
        const ready = gap.publishReady && auth.ok;
        expect(ready).toBe(true);
    });
    test("not ready when auth missing even if gap publishReady", () => {
        const gap = evaluatePublishGap({
            packageName: "@islee23520/lfg",
            localVersion: "0.1.4",
            registryVersion: "0.1.3",
            hasBin: true,
        });
        const auth = evaluateNpmPublishAuth(null);
        expect(gap.publishReady).toBe(true);
        expect(auth.ok).toBe(false);
        expect(gap.publishReady && auth.ok).toBe(false);
    });
});
