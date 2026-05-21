# Plugin metadata boundary

Plugin manifests and marketplace files are materialized JSON files because Grok, Claude, and Agents-compatible hosts read different schema entrypoints.

The Grok files should not invent unsupported JSON `$ref` or `extends` behavior. Instead, keep the shared fields aligned with the Claude/Agents-compatible files and verify that alignment in smoke tests:

- `plugins/lfg/.grok-plugin/plugin.json` mirrors the canonical values from `plugins/lfg/.claude-plugin/plugin.json`.
- `.grok/plugins/marketplace.json` keeps Grok-specific schema identity, while shared plugin fields follow `.agents/plugins/marketplace.json`.

Real Grok execution code belongs in optional runtime adapters under `src/`, guided by the official xAI SDK docs.
