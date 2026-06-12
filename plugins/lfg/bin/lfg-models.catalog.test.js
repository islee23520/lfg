import { describe, expect, test } from "vitest";
import { modelDiscoveryEnv } from "./lfg-models";
describe("lfg-models catalog env", () => {
    test("modelDiscoveryEnv exports LAZYCODEX model list and mapping", () => {
        const discovery = {
            baseUrl: "http://127.0.0.1:11434/v1",
            modelsUrl: "http://127.0.0.1:11434/v1/models",
            modelIds: ["a", "b"],
            mapping: { default: "a", fast: "a", reasoning: "b", coding: "a" },
        };
        const env = modelDiscoveryEnv(discovery);
        expect(env.LAZYCODEX_OPENAI_MODELS).toBe("a,b");
        expect(env.LAZYCODEX_MODEL_DEFAULT).toBe("a");
        expect(env.LAZYCODEX_MODEL_REASONING).toBe("b");
        expect(JSON.parse(env.LAZYCODEX_MODEL_MAPPING)).toEqual(discovery.mapping);
    });
});
