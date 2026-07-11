---
name: ultraresearch
description: "Legacy alias for ulw-research. MUST USE when the user asks for ultraresearch, /ultraresearch, or $ultraresearch; immediately load and follow the ulw-research skill."
---

## GrokBuild Tool Mapping

On Grok Build with lfg installed, translate OpenCode/Codex subagent examples to GrokBuild `spawn_subagent` calls. The adapter maps read-only exploration to the lfg-owned OMO persona `subagent_type: "explorer"`; do not use disabled Grok built-ins for those roles. This contract is shared for `coding_tool_adapter` `grok` and `pi-agent`.

| Intent | GrokBuild tool to use |
| --- | --- |
| Search/read-only worker | `spawn_subagent({ subagent_type: "explorer", background: true, description: "...", prompt: "TASK: ..." })` |
| Planning worker | `spawn_subagent({ subagent_type: "plan", background: true, description: "...", prompt: "TASK: ..." })` |
| Implementation or QA worker | `spawn_subagent({ subagent_type: "hephaestus" or "coding", background: true, description: "...", prompt: "TASK: ..." })` |


# Ultraresearch Alias

`ultraresearch` is the legacy name for `ulw-research`.

When this skill is selected, immediately load `../ulw-research/SKILL.md` and follow it as the source of truth. Treat `/ultraresearch`, `$ultraresearch`, and plain `ultraresearch` exactly like `/ulw-research`, `$ulw-research`, and plain `ulw-research`.
