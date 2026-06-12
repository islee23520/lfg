import { readFile } from "node:fs/promises";
import { join } from "node:path";
/** Read `[endpoints].models_base_url` from ~/.grok/config.toml (non-destructive). */
export async function readGrokModelsBaseUrlFromConfig(home) {
    const path = join(home, ".grok", "config.toml");
    let text;
    try {
        text = await readFile(path, "utf8");
    }
    catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
    return findTomlStringInSection(text, "endpoints", "models_base_url");
}
function findTomlStringInSection(source, section, key) {
    const header = `[${section}]`;
    const start = source.indexOf(header);
    if (start === -1) {
        return null;
    }
    const bodyStart = start + header.length;
    const rest = source.slice(bodyStart);
    const nextHeader = /\n\[[^\n]+\]/.exec(rest);
    const body = nextHeader?.index === undefined ? rest : rest.slice(0, nextHeader.index);
    const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(.+)$`, "m");
    const match = pattern.exec(body);
    if (!match?.[1]) {
        return null;
    }
    return parseTomlStringValue(match[1].trim());
}
function parseTomlStringValue(raw) {
    if (raw.startsWith('"""') || raw.startsWith("'''")) {
        return null;
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        const inner = raw.slice(1, -1);
        return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return raw.length > 0 ? raw : null;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
