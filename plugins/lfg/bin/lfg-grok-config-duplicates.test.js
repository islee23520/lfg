import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { writeGrokModelConfig } from "./lfg-grok-config";
describe("writeGrokModelConfig duplicate keys", () => {
    test("correctly merges with existing unquoted and quoted model sections without creating duplicates", async () => {
        const home = await mkdtemp(join(tmpdir(), "lfg-dup-test-"));
        const configPath = join(home, ".grok", "config.toml");
        await mkdir(join(home, ".grok"), { recursive: true });
        await writeFile(configPath, `[endpoints]
models_base_url = "http://127.0.0.1:8317/v1"

[model.grok-build]
model = "old-grok-model"
base_url = "http://127.0.0.1:8317/v1"
api_key = "sk-old"

[model."grok-build"]
model = "quoted-old-grok-model"
base_url = "http://127.0.0.1:8317/v1"
api_key = "sk-quoted-old"

[ui]
theme = "dark"
`, "utf8");
        const discovery = {
            baseUrl: "http://127.0.0.1:8317/v1",
            modelsUrl: "http://127.0.0.1:8317/v1/models",
            modelIds: ["grok-build"],
            mapping: {
                default: "grok-build",
                fast: "grok-build",
                reasoning: "grok-build",
                coding: "grok-build",
            },
        };
        try {
            await writeGrokModelConfig(discovery, {
                home,
                apiKey: "sk-new-api-key",
            });
            const content = await readFile(configPath, "utf8");
            const matches = content.match(/\[model(?:\.grok-build|\."grok-build")\]/g) ?? [];
            expect(matches).toHaveLength(1);
            expect(content).toContain('api_key = "sk-new-api-key"');
        }
        finally {
            await rm(home, { recursive: true, force: true });
        }
    });
});
