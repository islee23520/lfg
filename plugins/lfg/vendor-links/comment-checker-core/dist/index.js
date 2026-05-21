// @bun
// vendor/omo-standalone/packages/comment-checker-core/src/apply-patch-edits.ts
function extractApplyPatchEdits(details, args) {
  const metadataEdits = getApplyPatchMetadataFiles(details).filter((file) => file.type?.toLowerCase() !== "delete").map((file) => ({
    filePath: file.movePath ?? file.filePath,
    before: file.before,
    after: file.after
  }));
  if (metadataEdits.length > 0)
    return metadataEdits;
  const patch = args === undefined ? undefined : getString(args, ["patchText", "input", "patch", "command"]);
  if (patch === undefined)
    return [];
  return parseApplyPatchRequests(patch);
}
function getApplyPatchMetadataFiles(details) {
  if (!isRecord(details))
    return [];
  const direct = readApplyPatchMetadataFiles(details["files"]);
  if (direct.length > 0)
    return direct;
  const resultDetails = details["result"];
  const result = isRecord(resultDetails) ? readApplyPatchMetadataFiles(resultDetails["files"]) : [];
  if (result.length > 0)
    return result;
  const metadataDetails = details["metadata"];
  return isRecord(metadataDetails) ? readApplyPatchMetadataFiles(metadataDetails["files"]) : [];
}
function readApplyPatchMetadataFiles(value) {
  if (!Array.isArray(value))
    return [];
  const files = [];
  for (const item of value) {
    if (!isRecord(item))
      continue;
    const filePath = getString(item, ["filePath", "file_path", "path"]);
    const movePath = getString(item, ["movePath", "move_path"]);
    const before = getString(item, ["before", "old", "oldString", "old_string"]);
    const after = getString(item, ["after", "new", "newString", "new_string"]);
    const type = getString(item, ["type", "operation"]);
    if (filePath === undefined || before === undefined || after === undefined)
      continue;
    files.push({
      filePath,
      before,
      after,
      ...movePath === undefined ? {} : { movePath },
      ...type === undefined ? {} : { type }
    });
  }
  return files;
}
function parseApplyPatchRequests(patch) {
  const edits = [];
  let current;
  const flush = () => {
    if (current === undefined)
      return;
    if (current.operation === "add") {
      const after = joinPatchLines(current.newLines);
      if (after.length > 0) {
        edits.push({ filePath: current.filePath, before: "", after });
      }
    }
    if (current.operation === "update") {
      const after = joinPatchLines(current.newLines);
      if (after.length > 0) {
        edits.push({
          filePath: current.movePath ?? current.filePath,
          before: joinPatchLines(current.oldLines),
          after
        });
      }
    }
    current = undefined;
  };
  for (const line of patch.split(/\r?\n/)) {
    if (line === "*** Begin Patch" || line === "*** End Patch")
      continue;
    if (line.startsWith("*** Add File: ")) {
      flush();
      current = makeAccumulator("add", line.slice("*** Add File: ".length).trim());
      continue;
    }
    if (line.startsWith("*** Update File: ")) {
      flush();
      current = makeAccumulator("update", line.slice("*** Update File: ".length).trim());
      continue;
    }
    if (line.startsWith("*** Delete File: ")) {
      flush();
      current = makeAccumulator("delete", line.slice("*** Delete File: ".length).trim());
      continue;
    }
    if (line.startsWith("*** Move to: ")) {
      if (current?.operation === "update") {
        current.movePath = line.slice("*** Move to: ".length).trim();
      }
      continue;
    }
    if (current === undefined || line.startsWith("@@"))
      continue;
    if (current.operation === "add") {
      if (line.startsWith("+"))
        current.newLines.push(line.slice(1));
      continue;
    }
    if (current.operation === "update") {
      if (line.startsWith("-"))
        current.oldLines.push(line.slice(1));
      if (line.startsWith("+"))
        current.newLines.push(line.slice(1));
    }
  }
  flush();
  return edits;
}
function makeAccumulator(operation, filePath) {
  return {
    operation,
    filePath,
    oldLines: [],
    newLines: []
  };
}
function getString(input, keys) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string")
      return value;
  }
  return;
}
function joinPatchLines(lines) {
  return lines.length === 0 ? "" : `${lines.join(`
`)}
`;
}
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
// vendor/omo-standalone/packages/comment-checker-core/src/runner.ts
import { createRequire } from "module";
import { dirname, join } from "path";
var EMPTY_RESULT = { hasComments: false, message: "" };
function killProcessSafely(process, signal) {
  try {
    process.kill(signal);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
  }
}
function resolveCommentCheckerBinary(input) {
  const packageName = input.packageName ?? "@code-yeongyu/comment-checker";
  if (input.cachedBinaryPath !== null && input.existsSync(input.cachedBinaryPath)) {
    return input.cachedBinaryPath;
  }
  if (input.importMetaUrl === undefined) {
    return null;
  }
  try {
    const require2 = createRequire(input.importMetaUrl);
    const packageJsonPath = require2.resolve(`${packageName}/package.json`);
    const binaryPath = join(dirname(packageJsonPath), "bin", input.binaryName);
    return input.existsSync(binaryPath) ? binaryPath : null;
  } catch (error) {
    if (error instanceof Error) {
      return null;
    }
    throw error;
  }
}
async function runCommentChecker(input, options) {
  if (input.binaryPath === null || !options.existsSync(input.binaryPath)) {
    return EMPTY_RESULT;
  }
  const args = [input.binaryPath, "check"];
  if (input.customPrompt !== undefined) {
    args.push("--prompt", input.customPrompt);
  }
  const timeoutMs = options.timeoutMs ?? 30000;
  const killGraceMs = options.killGraceMs ?? 1000;
  const setTimer = options.setTimeoutFn ?? setTimeout;
  const clearTimer = options.clearTimeoutFn ?? clearTimeout;
  const process = options.spawn(args);
  process.stdin.write(JSON.stringify(input.hookInput));
  process.stdin.end();
  let timeoutId = null;
  let graceId = null;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimer(() => {
      killProcessSafely(process, "SIGTERM");
      graceId = setTimer(() => {
        killProcessSafely(process, "SIGKILL");
      }, killGraceMs);
      resolve("timeout");
    }, timeoutMs);
  });
  try {
    const stdoutPromise = new Response(process.stdout).text();
    const stderrPromise = new Response(process.stderr).text();
    const exitCodePromise = process.exited;
    const completed = Promise.all([stdoutPromise, stderrPromise, exitCodePromise]);
    const race = await Promise.race([completed, timeoutPromise]);
    if (race === "timeout") {
      return EMPTY_RESULT;
    }
    const [_stdout, stderr, exitCode] = race;
    if (exitCode === 0) {
      return EMPTY_RESULT;
    }
    if (exitCode === 2) {
      return { hasComments: true, message: stderr };
    }
    return EMPTY_RESULT;
  } catch (error) {
    if (error instanceof Error) {
      return EMPTY_RESULT;
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      clearTimer(timeoutId);
    }
    if (graceId !== null) {
      clearTimer(graceId);
    }
  }
}
export {
  runCommentChecker,
  resolveCommentCheckerBinary,
  readApplyPatchMetadataFiles,
  parseApplyPatchRequests,
  makeAccumulator,
  joinPatchLines,
  isRecord,
  getString,
  getApplyPatchMetadataFiles,
  extractApplyPatchEdits
};
