import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
/**
 * Ensures the installed hephaestus.md bundled rule carries a `models` frontmatter
 * gate so it only injects on GPT-5.x models.
 *
 * The upstream omo-codex hephaestus.md is model-agnostic (alwaysApply: true with
 * no model restriction). Since lfg cannot modify upstream source, this function
 * patches the installed copy at ~/.grok/plugins/lfg/components/rules/bundled-rules/
 * hephaestus.md after materialization.
 *
 * Idempotent: if `models:` already exists in the frontmatter, it is left as-is.
 */
const HEPHAESTUS_RELATIVE_PATH = join("components", "rules", "bundled-rules", "hephaestus.md");
const MODELS_LINE = "models:";
const MODELS_ENTRY = "  - gpt-5*";
export async function ensureHephaestusModelGate(pluginRoot) {
    const targetPath = join(pluginRoot, HEPHAESTUS_RELATIVE_PATH);
    let content;
    try {
        content = await readFile(targetPath, "utf8");
    }
    catch {
        return {
            ensured: false,
            patched: false,
            path: targetPath,
            reason: "hephaestus.md not found in plugin root",
        };
    }
    // Already has a models gate
    if (new RegExp(`^${MODELS_LINE}`, "m").test(content)) {
        return {
            ensured: true,
            patched: false,
            path: targetPath,
            reason: "models gate already present",
        };
    }
    // Inject `models:` before the closing `---` of the frontmatter
    const patched = injectModelsGate(content);
    if (patched === null) {
        return {
            ensured: false,
            patched: false,
            path: targetPath,
            reason: "could not locate frontmatter closing delimiter",
        };
    }
    await writeFile(targetPath, patched, "utf8");
    return {
        ensured: true,
        patched: true,
        path: targetPath,
        reason: "added gpt-5* model gate to frontmatter",
    };
}
/** Insert `models:\n  - gpt-5*` before the second `---` line (end of frontmatter). */
function injectModelsGate(content) {
    const lines = content.split("\n");
    let delimiterCount = 0;
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]?.trim() === "---") {
            delimiterCount += 1;
            if (delimiterCount === 2) {
                lines.splice(i, 0, MODELS_LINE, MODELS_ENTRY);
                return lines.join("\n");
            }
        }
    }
    return null;
}
