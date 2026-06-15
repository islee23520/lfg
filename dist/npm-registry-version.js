// src/cli/npm-registry-version.ts
function parseNpmRegistryVersion(stdout) {
  const trimmed = stdout.trim();
  return /^\d+\.\d+\.\d+/.test(trimmed) ? trimmed : null;
}
export {
  parseNpmRegistryVersion
};
//# sourceMappingURL=npm-registry-version.js.map
