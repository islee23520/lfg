#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { stdin as processStdin } from "node:process";

const MAX_OUTPUT_CHARS = 6000;

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.stderr.write("LFG comment-checker: malformed JSON payload\n");
  process.exit(1);
}

if (!isRecord(payload)) {
  process.stderr.write("LFG comment-checker: hook payload must be an object\n");
  process.exit(1);
}

const filePath = editedFilePath(payload);
if (filePath === null) {
  process.exit(0);
}

const text = await readEditedFile(filePath);
if (text === null) {
  process.exit(0);
}

const finding = firstTouchedCommentFinding(text, payload);
if (finding === null) {
  process.exit(0);
}

const cwd = stringField(payload, ["cwd", "workspaceRoot", "workspace_root"]) ?? process.cwd();
const displayPath = relative(cwd, filePath) || filePath;
const feedback = [
  "LFG comment-checker: comment needs attention.",
  `${displayPath}:${finding.line}: ${finding.comment}`,
  "Remove it, rewrite it to explain intent, or explain why this comment is necessary.",
].join("\n");

process.stdout.write(`${feedback.slice(0, MAX_OUTPUT_CHARS)}\n`);

async function readStdin() {
  let buffer = "";
  processStdin.setEncoding("utf8");
  for await (const chunk of processStdin) {
    buffer += chunk;
  }
  return buffer;
}

function editedFilePath(payload) {
  const toolInput = recordField(payload, "toolInput") ?? recordField(payload, "tool_input");
  const toolResponse =
    recordField(payload, "toolResponse") ?? recordField(payload, "tool_response") ?? recordField(payload, "toolOutput");
  const rawPath =
    stringField(toolInput, ["filePath", "file_path", "path"]) ?? stringField(toolResponse, ["filePath", "file_path", "path"]);
  if (rawPath === null) {
    return null;
  }
  return resolve(stringField(payload, ["cwd", "workspaceRoot", "workspace_root"]) ?? process.cwd(), rawPath);
}

async function readEditedFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function firstTouchedCommentFinding(text, payload) {
  const lines = text.split(/\r?\n/);
  for (const lineNumber of touchedLineNumbers(payload)) {
    const line = lines[lineNumber - 1];
    if (line === undefined) {
      continue;
    }
    const comment = extractLineComment(line);
    if (comment === null) {
      continue;
    }
    if (isObviousComment(comment)) {
      return { line: lineNumber, comment };
    }
  }
  for (const comment of touchedCommentTexts(payload)) {
    if (!isObviousComment(comment)) {
      continue;
    }
    const line = findCommentLine(lines, comment);
    if (line !== null) {
      return { line, comment };
    }
  }
  return null;
}

function touchedLineNumbers(payload) {
  const toolInput = recordField(payload, "toolInput") ?? recordField(payload, "tool_input");
  const patch = stringField(toolInput, ["patch", "diff"]);
  return patch === null ? [] : addedLineNumbersFromUnifiedDiff(patch);
}

function addedLineNumbersFromUnifiedDiff(patch) {
  const lineNumbers = [];
  let newLine = null;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = line.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunk !== null) {
      const parsed = Number.parseInt(hunk[1], 10);
      newLine = Number.isSafeInteger(parsed) ? parsed : null;
      continue;
    }
    if (newLine === null) {
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lineNumbers.push(newLine);
      newLine += 1;
      continue;
    }
    if (line.startsWith(" ")) {
      newLine += 1;
    }
  }
  return lineNumbers;
}

function touchedCommentTexts(payload) {
  const toolInput = recordField(payload, "toolInput") ?? recordField(payload, "tool_input");
  if (toolInput === null) {
    return [];
  }
  return [
    ...commentTextsFromReplacementRecord(toolInput),
    ...commentTextsFromEdits(toolInput),
  ];
}

function commentTextsFromEdits(toolInput) {
  const edits = toolInput.edits;
  if (!Array.isArray(edits)) {
    return [];
  }
  return edits.flatMap((edit) => (isRecord(edit) ? commentTextsFromReplacementRecord(edit) : []));
}

function commentTextsFromReplacementRecord(record) {
  return stringFields(record, ["newString", "new_string", "replacement", "replace", "content", "fileContent", "file_content"])
    .flatMap(commentTextsFromSnippet);
}

function commentTextsFromSnippet(snippet) {
  return snippet
    .split(/\r?\n/)
    .map(extractLineComment)
    .filter((comment) => comment !== null);
}

function findCommentLine(lines, targetComment) {
  for (const [index, line] of lines.entries()) {
    if (extractLineComment(line) === targetComment) {
      return index + 1;
    }
  }
  return null;
}

function extractLineComment(line) {
  const match = line.match(/^\s*\/\/\s*(.+?)\s*$/);
  return match?.[1] ?? null;
}

function isObviousComment(comment) {
  return /^(add|subtract|multiply|divide|return|set|get|assign|increment|decrement|create|initialize|call|check)\b/i.test(comment);
}

function recordField(record, key) {
  if (!isRecord(record)) {
    return null;
  }
  const value = record[key];
  return isRecord(value) ? value : null;
}

function stringField(record, keys) {
  if (!isRecord(record)) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}

function stringFields(record, keys) {
  if (!isRecord(record)) {
    return [];
  }
  return keys.flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.length > 0 ? [value] : [];
  });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
