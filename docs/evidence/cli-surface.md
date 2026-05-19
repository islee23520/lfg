# CLI Surface Evidence

## Provenance
- binary: /Users/ilseoblee/.grok/bin/grok
- sha256: 677fe9b629674bdc8e47f7ed01a640158cfbcf93bf735f07b02fd0308cf19bac
- version: grok 0.1.211 (2f2cd6d5c2)
- captured: 2026-05-18T07:04:00Z
- exit_code: 0

## grok --help
Grok Build TUI

Usage: grok [OPTIONS] [COMMAND]

Options:
      --agent <NAME>
          Agent name or definition file path
      --agents <JSON>
          Inline subagent definitions as JSON
      --allow <RULE>
          Permission allow rule. Repeat to add multiple rules
      --always-approve
          Auto-approve all tool executions
      --best-of-n <N>
          Run the task N ways in parallel and pick the best (headless only)
  -c, --continue
          Continue the most recent session for the current working directory
      --check
          Append a self-verification loop to the prompt (headless only)
      --cwd <CWD>
          Working directory
      --deny <RULE>
          Permission deny rule. Repeat to add multiple rules
      --disable-web-search
          Disable web search and web fetch tools
      --disallowed-tools <TOOLS>
          Built-in tools to remove (comma-separated)
      --effort <LEVEL>
          Effort level [possible values: low, medium, high, xhigh, max]
      --experimental-memory
          Enable cross-session memory
  -h, --help
          Print help
  -m, --model <MODEL>
          Model ID to use
      --max-turns <N>
          Maximum number of agent turns
      --no-alt-screen
          Run inline instead of using the terminal alternate screen
      --no-memory
          Disable cross-session memory for this session
      --no-plan
          Disable plan mode
      --no-subagents
          Disable subagent spawning
      --oauth
          Use OAuth when the welcome screen starts authentication
      --output-format <OUTPUT_FORMAT>
          Output format for headless mode [default: plain] [possible values: plain, json, streaming-json]
  -p, --single <PROMPT>
          Single-turn prompt. Prints the response to stdout and exits
      --permission-mode <MODE>
          Permission mode [possible values: default, acceptEdits, auto, dontAsk, bypassPermissions, plan]
      --prompt-file <PATH>
          Single-turn prompt from a file
      --prompt-json <JSON>
          Single-turn prompt as JSON content blocks
  -r, --resume [<SESSION_ID>]
          Resume a session by ID, or the most recent if omitted
      --reasoning-effort <EFFORT>
          Reasoning effort for reasoning models
      --restore-code
          Check out the original session's commit when resuming
      --rules <RULES>
          Extra rules to append to the system prompt
      --sandbox <PROFILE>
          Sandbox profile for filesystem and network access [env: GROK_SANDBOX=]
      --system-prompt-override <PROMPT>
          Override the agent's system prompt
      --tools <TOOLS>
          Built-in tools to allow (comma-separated)
  -v, --version
          Print version
      --verbatim
          Send the prompt exactly as given
  -w, --worktree [<WORKTREE>]
          Start the session in a new git worktree, optionally named

Commands:
  agent     Run Grok without the interactive UI
  help      Print this message or the help of the given subcommand(s)
  import    Import sessions into Grok
  inspect   Show the configuration Grok discovers for this directory
  leader    Manage running leader processes
  login     Sign in to Grok
  mcp       Manage MCP server configurations
  memory    Manage cross-session memory
  models    List available models and exit
  sessions  List, search, or restore sessions
  setup     Fetch and install managed deployment configuration
  share     Share a session and print the share URL
  ssh       Run ssh with local clipboard support
  trace     Export or upload session trace data
  update    Check for updates or install a specific version
  version   Print version information [aliases: v]
  worktree  Manage git worktrees

## grok models --help
List available models and exit

Usage: grok models

Options:
  -h, --help  Print help

## grok mcp --help
Manage MCP server configurations

Usage: grok mcp <COMMAND>

Commands:
  list    List configured MCP servers
  add     Add or update an MCP server configuration
  remove  Remove an MCP server configuration
  doctor  Diagnose MCP server configuration and connectivity
  help    Print this message or the help of the given subcommand(s)

Options:
  -h, --help  Print help

## grok sessions --help
List, search, or restore sessions

Usage: grok sessions <COMMAND>

Commands:
  list    List recent sessions (same as search with no query)
  search  Search sessions by keyword
  help    Print this message or the help of the given subcommand(s)

Options:
  -h, --help  Print help

## grok trace --help
Export or upload session trace data

Usage: grok trace [OPTIONS] <SESSION_ID>

Arguments:
  <SESSION_ID>  Session ID to export/upload

Options:
      --local            Save locally only, skip remote upload
  -o, --output <OUTPUT>  Output path (default: ~/.grok/trace-exports/<session-id>.tar.gz)
      --json             Emit machine-readable JSON output
  -h, --help             Print help

## grok share --help
Share a session and print the share URL

Usage: grok share <SESSION_ID>

Arguments:
  <SESSION_ID>  Session ID to share

Options:
  -h, --help  Print help

## grok agent --help
Run Grok without the interactive UI

Usage: grok agent [OPTIONS] [COMMAND]

Commands:
  stdio     Run the agent over stdio
  headless  Run the agent headlessly over the Grok WebSocket relay
  serve     Run the agent as a WebSocket server
  leader    Run as the shared leader process for other clients
  help      Print this message or the help of the given subcommand(s)

Options:
      --reauth
          Run authentication before starting the agent [aliases: ----reauthenticate]
  -m, --model <MODEL>
          Model ID to use
      --reasoning-effort <EFFORT>
          Reasoning effort for reasoning models
      --always-approve
          Auto-approve all tool executions
      --agent-profile <PATH>
          Path to an agent profile file
      --leader
          Connect to a shared leader process instead of starting a new agent. Allows multiple clients to share one backend. Defaults to [cli] use_leader in config.toml
      --no-leader
          Start a new agent even when config enables leader mode
      --grok-ws-origin <GROK_WS_ORIGIN>

      --grok-ws-url <GROK_WS_URL>

      --cli-chat-proxy-base-url <CLI_CHAT_PROXY_BASE_URL>
          Override the CLI chat proxy base URL
      --xai-api-base-url <XAI_API_BASE_URL>
          Override the public xAI API base URL
  -h, --help
          Print help

## grok agent headless --help
Run the agent headlessly over the Grok WebSocket relay

Usage: grok agent headless [OPTIONS]

Options:
      --grok-ws-origin <GROK_WS_ORIGIN>
      --grok-ws-url <GROK_WS_URL>
  -h, --help                             Print help

## grok agent stdio --help
Run the agent over stdio

Usage: grok agent stdio

Options:
  -h, --help  Print help
