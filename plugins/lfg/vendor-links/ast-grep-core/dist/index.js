// @bun
// vendor/omo-standalone/packages/ast-grep-core/src/language-support.ts
var CLI_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "elixir",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "nix",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "solidity",
  "swift",
  "typescript",
  "tsx",
  "yaml"
];
var DEFAULT_TIMEOUT_MS = 300000;
var DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024;
var DEFAULT_MAX_MATCHES = 500;
// vendor/omo-standalone/packages/ast-grep-core/src/pattern-hints.ts
function detectRegexMisuse(pattern) {
  const src = pattern.trim();
  if (/\\[wWdDsSbB]/.test(src)) {
    return 'Hint: "\\w", "\\d", "\\s", "\\b" are regex escapes. ast-grep matches AST nodes, not text - use $VAR for identifiers, $$$ for node lists, or switch to grep for text search.';
  }
  if (/\[[a-zA-Z0-9]-[a-zA-Z0-9]\]/.test(src)) {
    return 'Hint: "[a-z]" and similar character classes are regex, not AST. Use $VAR to match any identifier, or switch to grep for text search.';
  }
  if (!src.includes("$") && /\w\.[*+]/.test(src)) {
    return 'Hint: ".*" and ".+" are regex wildcards. In ast-grep use $$$ for multiple AST nodes and $VAR for a single node. For text patterns, switch to grep.';
  }
  if (/^[-\w.*]+\|[-\w.*|]+$/.test(src)) {
    return 'Hint: "|" is regex alternation and does NOT work in ast-grep patterns. Options: (a) fire one ast_grep_search per alternative, or (b) switch to grep with a regex pattern like "foo|bar".';
  }
  return null;
}
function detectLanguageSpecificMistake(pattern, lang) {
  const src = pattern.trim();
  if (lang === "python") {
    if (src.startsWith("class ") && src.endsWith(":")) {
      return `Hint: Remove trailing colon. Try: "${src.slice(0, -1)}"`;
    }
    if ((src.startsWith("def ") || src.startsWith("async def ")) && src.endsWith(":")) {
      return `Hint: Remove trailing colon. Try: "${src.slice(0, -1)}"`;
    }
  }
  if (["javascript", "typescript", "tsx"].includes(lang)) {
    if (/^(export\s+)?(async\s+)?function\s+\$[A-Z_]+\s*$/i.test(src)) {
      return 'Hint: Function patterns need params and body. Try "function $NAME($$$) { $$$ }"';
    }
  }
  if (lang === "go") {
    if (/^func\s+\$[A-Z_]+\s*$/i.test(src)) {
      return 'Hint: Go function patterns need params and body. Try "func $NAME($$$) { $$$ }"';
    }
  }
  if (lang === "rust") {
    if (/^fn\s+\$[A-Z_]+\s*$/i.test(src)) {
      return 'Hint: Rust fn patterns need params and body. Try "fn $NAME($$$) { $$$ }"';
    }
  }
  return null;
}
function getPatternHint(pattern, lang) {
  return detectRegexMisuse(pattern) ?? detectLanguageSpecificMistake(pattern, lang);
}
// vendor/omo-standalone/packages/ast-grep-core/src/result-formatter.ts
function formatSearchResult(result) {
  if (result.error) {
    return `Error: ${result.error}`;
  }
  if (result.matches.length === 0) {
    return "No matches found";
  }
  const lines = [];
  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches" ? `showing first ${result.matches.length} of ${result.totalMatches}` : result.truncatedReason === "max_output_bytes" ? "output exceeded 1MB limit" : "search timed out";
    lines.push(`[TRUNCATED] Results truncated (${reason})
`);
  }
  lines.push(`Found ${result.matches.length} match(es)${result.truncated ? ` (truncated from ${result.totalMatches})` : ""}:
`);
  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`;
    lines.push(`${loc}`);
    lines.push(`  ${match.lines.trim()}`);
    lines.push("");
  }
  return lines.join(`
`);
}
function formatReplaceResult(result, isDryRun) {
  if (result.error) {
    return `Error: ${result.error}`;
  }
  if (result.matches.length === 0) {
    return "No matches found to replace";
  }
  const prefix = isDryRun ? "[DRY RUN] " : "";
  const lines = [];
  if (result.truncated) {
    const reason = result.truncatedReason === "max_matches" ? `showing first ${result.matches.length} of ${result.totalMatches}` : result.truncatedReason === "max_output_bytes" ? "output exceeded 1MB limit" : "search timed out";
    lines.push(`[TRUNCATED] Results truncated (${reason})
`);
  }
  lines.push(`${prefix}${result.matches.length} replacement(s):
`);
  for (const match of result.matches) {
    const loc = `${match.file}:${match.range.start.line + 1}:${match.range.start.column + 1}`;
    lines.push(`${loc}`);
    lines.push(`  ${match.text}`);
    lines.push("");
  }
  if (isDryRun) {
    lines.push("Use dryRun=false to apply changes");
  }
  return lines.join(`
`);
}
// vendor/omo-standalone/packages/ast-grep-core/src/sg-compact-json-output.ts
function createSgResultFromStdout(stdout) {
  if (!stdout.trim()) {
    return { matches: [], totalMatches: 0, truncated: false };
  }
  const outputTruncated = stdout.length >= DEFAULT_MAX_OUTPUT_BYTES;
  const outputToProcess = outputTruncated ? stdout.substring(0, DEFAULT_MAX_OUTPUT_BYTES) : stdout;
  let matches = [];
  try {
    matches = JSON.parse(outputToProcess);
  } catch {
    if (outputTruncated) {
      try {
        const lastValidIndex = outputToProcess.lastIndexOf("}");
        if (lastValidIndex > 0) {
          const bracketIndex = outputToProcess.lastIndexOf("},", lastValidIndex);
          if (bracketIndex > 0) {
            const truncatedJson = outputToProcess.substring(0, bracketIndex + 1) + "]";
            matches = JSON.parse(truncatedJson);
          }
        }
      } catch {
        return {
          matches: [],
          totalMatches: 0,
          truncated: true,
          truncatedReason: "max_output_bytes",
          error: "Output too large and could not be parsed"
        };
      }
    } else {
      return { matches: [], totalMatches: 0, truncated: false };
    }
  }
  const totalMatches = matches.length;
  const matchesTruncated = totalMatches > DEFAULT_MAX_MATCHES;
  const finalMatches = matchesTruncated ? matches.slice(0, DEFAULT_MAX_MATCHES) : matches;
  return {
    matches: finalMatches,
    totalMatches,
    truncated: outputTruncated || matchesTruncated,
    truncatedReason: outputTruncated ? "max_output_bytes" : matchesTruncated ? "max_matches" : undefined
  };
}
// vendor/omo-standalone/packages/ast-grep-core/src/runner.ts
var SG_BINARY_NOT_FOUND_MESSAGE = `ast-grep (sg) binary not found.

` + `Install options:
` + `  bun add -D @ast-grep/cli
` + `  cargo install ast-grep --locked
` + `  brew install ast-grep`;
function buildSgArgs(options, flags) {
  const args = ["run", "-p", options.pattern, "--lang", options.lang];
  if (flags.includeJson) {
    args.push("--json=compact");
  }
  if (options.rewrite) {
    args.push("-r", options.rewrite);
    if (flags.includeUpdateAll) {
      args.push("--update-all");
    }
  }
  if (typeof options.context === "number" && options.context > 0) {
    args.push("-C", String(options.context));
  }
  if (options.globs) {
    for (const glob of options.globs) {
      args.push("--globs", glob);
    }
  }
  const paths = options.paths && options.paths.length > 0 ? options.paths : ["."];
  args.push("--", ...paths);
  return args;
}
async function runSg(options, deps) {
  const shouldSeparateWritePass = Boolean(options.rewrite && options.updateAll);
  const args = buildSgArgs(options, { includeJson: true, includeUpdateAll: false });
  let binary;
  try {
    binary = await deps.resolveBinary();
  } catch (error) {
    return {
      matches: [],
      totalMatches: 0,
      truncated: false,
      error: isNoEntryError(error) ? SG_BINARY_NOT_FOUND_MESSAGE : `Failed to resolve ast-grep binary: ${errorMessage(error)}`
    };
  }
  const searchResult = await trySpawn(binary, args, options.cwd, deps);
  if (searchResult.error) {
    return searchResult.error;
  }
  const output = searchResult.value;
  if (output.exitCode !== 0 && output.stdout.trim() === "") {
    if (output.stderr.includes("No files found")) {
      return { matches: [], totalMatches: 0, truncated: false };
    }
    if (output.stderr.trim()) {
      return { matches: [], totalMatches: 0, truncated: false, error: output.stderr.trim() };
    }
    return { matches: [], totalMatches: 0, truncated: false };
  }
  const jsonResult = createSgResultFromStdout(output.stdout);
  if (!(shouldSeparateWritePass && jsonResult.matches.length > 0)) {
    return jsonResult;
  }
  const writeArgs = buildSgArgs(options, { includeJson: false, includeUpdateAll: true });
  const writeResult = await trySpawn(binary, writeArgs, options.cwd, deps);
  if (writeResult.error) {
    return { ...jsonResult, error: `Replace failed: ${writeResult.error.error ?? "unknown error"}` };
  }
  if (writeResult.value.exitCode !== 0) {
    const errorDetail = writeResult.value.stderr.trim() || `ast-grep exited with code ${writeResult.value.exitCode}`;
    return { ...jsonResult, error: `Replace failed: ${errorDetail}` };
  }
  return jsonResult;
}
async function trySpawn(binary, args, cwd, deps) {
  try {
    const value = await deps.spawnProcess(binary, args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
    return { value };
  } catch (error) {
    if (error instanceof Error && error.message.includes("timeout")) {
      return {
        error: {
          matches: [],
          totalMatches: 0,
          truncated: true,
          truncatedReason: "timeout",
          error: error.message
        }
      };
    }
    if (isNoEntryError(error)) {
      return {
        error: {
          matches: [],
          totalMatches: 0,
          truncated: false,
          error: SG_BINARY_NOT_FOUND_MESSAGE
        }
      };
    }
    return {
      error: {
        matches: [],
        totalMatches: 0,
        truncated: false,
        error: `Failed to spawn ast-grep: ${errorMessage(error)}`
      }
    };
  }
}
function isNoEntryError(error) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = Reflect.get(error, "code");
  const message = errorMessage(error);
  return code === "ENOENT" || message.includes("ENOENT") || message.includes("not found");
}
function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
export {
  runSg,
  getPatternHint,
  formatSearchResult,
  formatReplaceResult,
  detectRegexMisuse,
  detectLanguageSpecificMistake,
  createSgResultFromStdout,
  buildSgArgs,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_MAX_MATCHES,
  CLI_LANGUAGES
};
