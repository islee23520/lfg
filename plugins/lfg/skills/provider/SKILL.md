---
name: provider
description: "List, show, or add provider/model metadata without storing secret values."
user_invocable: true
---

# Provider — AI Provider Management

Manage your AI providers and model profiles. This skill allows you to list available providers, show details for a specific provider, and add new provider metadata.

## Usage

```text
/provider list
/provider show <provider-id>
/provider add --id <id> --kind <kind> --env <env-var> --model <model-name>
```

## Behavior

- **Metadata Only**: LFG stores only the metadata (provider ID, kind, environment variable name, model name). It **never** stores API keys or secrets.
- **Model Profiles**: Configured providers are used by agents to resolve the correct model for execution.
- **Grok First**: By default, agents prefer Grok models unless a specific provider is required (e.g., Hephaestus requiring GPT-5.5).

## Runtime

Backed by `lfg provider` and MCP `grok_build_provider`.
