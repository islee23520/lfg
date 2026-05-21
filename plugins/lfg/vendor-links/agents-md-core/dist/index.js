// @bun
// vendor/omo-standalone/packages/agents-md-core/src/constants.ts
var AGENTS_FILENAME = "AGENTS.md";
var TRUNCATION_NOTICE_PREFIX = `

[Note: Content was truncated to save context window space. For full context, please read the file directly: `;
var TRUNCATION_NOTICE_SUFFIX = "]";
// vendor/omo-standalone/packages/agents-md-core/src/finder.ts
import {
  findAgentsMdUp as findAgentsMdUpCore
} from "@oh-my-opencode/rules-engine";
import { isAbsolute, resolve } from "path";
function resolveFilePath(rootDirectory, path) {
  if (!path)
    return null;
  if (isAbsolute(path))
    return path;
  return resolve(rootDirectory, path);
}
async function findAgentsMdUp(input) {
  return findAgentsMdUpCore({
    startDir: input.startDir,
    rootDir: input.rootDir,
    cache: input.cache
  });
}
// vendor/omo-standalone/packages/agents-md-core/src/formatter.ts
function formatAgentsMdContextBlock(input) {
  const truncationNotice = input.truncated ? `${TRUNCATION_NOTICE_PREFIX}${input.agentsPath}${TRUNCATION_NOTICE_SUFFIX}` : "";
  return `

[Directory Context: ${input.agentsPath}]
${input.content}${truncationNotice}`;
}
// vendor/omo-standalone/packages/agents-md-core/src/injection-cache.ts
function getSessionCache(input) {
  const existing = input.sessionCaches.get(input.sessionID);
  if (existing)
    return existing;
  const loaded = input.storage.loadInjectedPaths(input.sessionID);
  input.sessionCaches.set(input.sessionID, loaded);
  return loaded;
}
// vendor/omo-standalone/packages/agents-md-core/src/injector.ts
import { promises as fsPromises } from "fs";
import { dirname } from "path";
async function processFilePathForAgentsInjection(input) {
  if (typeof input.output.output !== "string")
    return;
  const resolved = resolveFilePath(input.rootDirectory, input.filePath);
  if (!resolved)
    return;
  const dir = dirname(resolved);
  const cache = getSessionCache({
    sessionCaches: input.sessionCaches,
    sessionID: input.sessionID,
    storage: input.storage
  });
  const agentsPaths = await findAgentsMdUp({
    startDir: dir,
    rootDir: input.rootDirectory,
    cache: input.agentsMdCache
  });
  let dirty = false;
  for (const agentsPath of agentsPaths) {
    const agentsDir = dirname(agentsPath);
    if (cache.has(agentsDir))
      continue;
    const content = await fsPromises.readFile(agentsPath, "utf-8").catch(() => null);
    if (content === null)
      continue;
    cache.add(agentsDir);
    const { result, truncated } = await input.truncator.truncate(input.sessionID, content);
    input.output.output += formatAgentsMdContextBlock({
      agentsPath,
      content: result,
      truncated
    });
    dirty = true;
  }
  if (dirty) {
    input.storage.saveInjectedPaths(input.sessionID, cache);
  }
}
export {
  resolveFilePath,
  processFilePathForAgentsInjection,
  getSessionCache,
  formatAgentsMdContextBlock,
  findAgentsMdUp,
  AGENTS_FILENAME
};
