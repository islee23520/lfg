// Curated lfg port of upstream skills-loader-core.
//
// Vendored: host-neutral config schemas/env-prefix parsing, shared marker/path/jsonc helpers,
// shared skill types, builtin skill metadata selection/filtering, and explicit-root skill file loading.
// Deferred: OpenCode runtime discovery/loaders, runtime skill source server, auto-slash-command hooks,
// tools/skill lifecycle code, Claude-Code compatibility types, and bundled SKILL.md content/resources;
// those layers depend on OpenCode/Claude-Code host APIs or large content bundles outside this phase.

export * from "./types"
export * from "./config"
export * from "./shared"
export * from "./features/builtin-skills"
