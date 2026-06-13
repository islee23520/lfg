import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const HEPHAESTUS_RELATIVE_PATH = join("components", "rules", "bundled-rules", "hephaestus.md");
const MODELS_LINE = "models:";
const MODELS_ENTRY = "  - gpt-5*";
async function ensureHephaestusModelGate(pluginRoot) {
  const targetPath = join(pluginRoot, HEPHAESTUS_RELATIVE_PATH);
  let content;
  try {
    content = await readFile(targetPath, "utf8");
  } catch {
    return {
      ensured: false,
      patched: false,
      path: targetPath,
      reason: "hephaestus.md not found in plugin root"
    };
  }
  if (new RegExp(`^${MODELS_LINE}`, "m").test(content)) {
    return {
      ensured: true,
      patched: false,
      path: targetPath,
      reason: "models gate already present"
    };
  }
  const patched = injectModelsGate(content);
  if (patched === null) {
    return {
      ensured: false,
      patched: false,
      path: targetPath,
      reason: "could not locate frontmatter closing delimiter"
    };
  }
  await writeFile(targetPath, patched, "utf8");
  return {
    ensured: true,
    patched: true,
    path: targetPath,
    reason: "added gpt-5* model gate to frontmatter"
  };
}
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
export {
  ensureHephaestusModelGate
};
