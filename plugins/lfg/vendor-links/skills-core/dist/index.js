// @bun
// vendor/omo-standalone/packages/skills-core/src/skills/playwright.ts
var playwrightSkill = {
  name: "playwright",
  description: "MUST USE for any browser-related tasks. Browser automation via Playwright MCP - verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: `# Playwright Browser Automation

This skill provides browser automation capabilities via the Playwright MCP server.`,
  mcpConfig: {
    playwright: {
      command: "npx",
      args: ["@playwright/mcp@latest"]
    }
  }
};
var agentBrowserSkill = {
  name: "agent-browser",
  description: "MUST USE for any browser-related tasks. Browser automation via agent-browser CLI - verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: `# Browser Automation with agent-browser

## Quick start

\`\`\`bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
\`\`\`

## Core workflow

1. Navigate: \`agent-browser open <url>\`
2. Snapshot: \`agent-browser snapshot -i\` (returns elements with refs like \`@e1\`, \`@e2\`)
3. Interact using refs from the snapshot
4. Re-snapshot after navigation or significant DOM changes

## Commands

### Navigation
\`\`\`bash
agent-browser open <url>      # Navigate to URL (aliases: goto, navigate)
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser (aliases: quit, exit)
\`\`\`

### Snapshot (page analysis)
\`\`\`bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -i -C      # Include cursor-interactive elements (divs with onclick, etc.)
agent-browser snapshot -c         # Compact (remove empty structural elements)
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
agent-browser snapshot -i -c -d 5 # Combine options
\`\`\`

The \`-C\` flag is useful for modern web apps that use custom clickable elements (divs, spans) instead of standard buttons/links.

### Interactions (use @refs from snapshot)
\`\`\`bash
agent-browser click @e1           # Click (--new-tab to open in new tab)
agent-browser dblclick @e1        # Double-click
agent-browser focus @e1           # Focus element
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser keyboard type "text"     # Type with real keystrokes (no selector, current focus)
agent-browser keyboard inserttext "text"  # Insert text without key events (no selector)
agent-browser press Enter         # Press key
agent-browser press Control+a     # Key combination
agent-browser keydown Shift       # Hold key down
agent-browser keyup Shift         # Release key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown
agent-browser scroll down 500     # Scroll page (--selector <sel> for container)
agent-browser scrollintoview @e1  # Scroll element into view (alias: scrollinto)
agent-browser drag @e1 @e2        # Drag and drop
agent-browser upload @e1 file.pdf # Upload files
\`\`\`

### Get information
\`\`\`bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get count ".item"   # Count matching elements
agent-browser get box @e1         # Get bounding box
agent-browser get styles @e1      # Get computed styles
\`\`\`

### Check state
\`\`\`bash
agent-browser is visible @e1      # Check if visible
agent-browser is enabled @e1      # Check if enabled
agent-browser is checked @e1      # Check if checked
\`\`\`

### Screenshots & PDF
\`\`\`bash
agent-browser screenshot          # Screenshot (saves to temp dir if no path)
agent-browser screenshot path.png # Save to file
agent-browser screenshot --full   # Full page
agent-browser screenshot --annotate   # Annotated screenshot with numbered element labels
agent-browser pdf output.pdf      # Save as PDF
\`\`\`

Annotated screenshots overlay numbered labels \`[N]\` on interactive elements. Each label corresponds to ref \`@eN\`, so refs work for both visual and text workflows:
\`\`\`bash
agent-browser screenshot --annotate ./page.png
# Output: [1] @e1 button "Submit", [2] @e2 link "Home", [3] @e3 textbox "Email"
agent-browser click @e2     # Click the "Home" link labeled [2]
\`\`\`

### Video recording
\`\`\`bash
agent-browser record start ./demo.webm    # Start recording (uses current URL + state)
agent-browser click @e1                   # Perform actions
agent-browser record stop                 # Stop and save video
agent-browser record restart ./take2.webm # Stop current + start new recording
\`\`\`
Recording creates a fresh context but preserves cookies/storage from your session.

### Wait
\`\`\`bash
agent-browser wait @e1                     # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"        # Wait for text
agent-browser wait --url "**/dashboard"    # Wait for URL pattern
agent-browser wait --load networkidle      # Wait for network idle
agent-browser wait --fn "window.ready"     # Wait for JS condition
\`\`\`

Load states: \`load\`, \`domcontentloaded\`, \`networkidle\`

### Mouse control
\`\`\`bash
agent-browser mouse move 100 200      # Move mouse
agent-browser mouse down left         # Press button (left/right/middle)
agent-browser mouse up left           # Release button
agent-browser mouse wheel 100         # Scroll wheel
\`\`\`

### Semantic locators (alternative to refs)
\`\`\`bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search..." fill "query"
agent-browser find alt "Logo" click
agent-browser find title "Close" click
agent-browser find testid "submit-btn" click
agent-browser find first ".item" click
agent-browser find last ".item" click
agent-browser find nth 2 "a" text
\`\`\`

Actions: \`click\`, \`fill\`, \`type\`, \`hover\`, \`focus\`, \`check\`, \`uncheck\`, \`text\`
Options: \`--name <name>\` (filter role by accessible name), \`--exact\` (require exact text match)

### Browser settings
\`\`\`bash
agent-browser set viewport 1920 1080      # Set viewport size
agent-browser set device "iPhone 14"      # Emulate device
agent-browser set geo 37.7749 -122.4194   # Set geolocation
agent-browser set offline on              # Toggle offline mode
agent-browser set headers '{"X-Key":"v"}' # Extra HTTP headers
agent-browser set credentials user pass   # HTTP basic auth
agent-browser set media dark              # Emulate color scheme
\`\`\`

### Cookies & Storage
\`\`\`bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies

agent-browser storage local               # Get all localStorage
agent-browser storage local key           # Get specific key
agent-browser storage local set k v       # Set value
agent-browser storage local clear         # Clear all

agent-browser storage session             # Same for sessionStorage
\`\`\`

### Network
\`\`\`bash
agent-browser network route <url>              # Intercept requests
agent-browser network route <url> --abort      # Block requests
agent-browser network route <url> --body '{}'  # Mock response
agent-browser network unroute [url]            # Remove routes
agent-browser network requests                 # View tracked requests
agent-browser network requests --filter api    # Filter requests
\`\`\`

### Tabs & Windows
\`\`\`bash
agent-browser tab                 # List tabs
agent-browser tab new [url]       # New tab
agent-browser tab 2               # Switch to tab
agent-browser tab close           # Close tab
agent-browser window new          # New window
\`\`\`

### Frames
\`\`\`bash
agent-browser frame "#iframe"     # Switch to iframe
agent-browser frame main          # Back to main frame
\`\`\`

### Dialogs
\`\`\`bash
agent-browser dialog accept [text]  # Accept dialog (with optional prompt text)
agent-browser dialog dismiss        # Dismiss dialog
\`\`\`

### Diff (compare snapshots, screenshots, URLs)
\`\`\`bash
agent-browser diff snapshot                              # Compare current vs last snapshot
agent-browser diff snapshot --baseline before.txt        # Compare current vs saved snapshot file
agent-browser diff snapshot --selector "#main" --compact # Scoped snapshot diff
agent-browser diff screenshot --baseline before.png      # Visual pixel diff against baseline
agent-browser diff screenshot --baseline b.png -o d.png  # Save diff image to custom path
agent-browser diff screenshot --baseline b.png -t 0.2    # Adjust color threshold (0-1)
agent-browser diff url https://v1.com https://v2.com     # Compare two URLs (snapshot diff)
agent-browser diff url https://v1.com https://v2.com --screenshot  # Also visual diff
agent-browser diff url https://v1.com https://v2.com --selector "#main"  # Scope to element
\`\`\`

### JavaScript
\`\`\`bash
agent-browser eval "document.title"   # Run JavaScript
agent-browser eval -b "base64code"    # Run base64-encoded JS
agent-browser eval --stdin            # Read JS from stdin
\`\`\`

### Debug & Profiling
\`\`\`bash
agent-browser console                 # View console messages
agent-browser console --clear         # Clear console
agent-browser errors                  # View page errors
agent-browser errors --clear          # Clear errors
agent-browser highlight @e1           # Highlight element
agent-browser trace start             # Start recording trace
agent-browser trace stop trace.zip    # Stop and save trace
agent-browser profiler start          # Start Chrome DevTools profiling
agent-browser profiler stop profile.json  # Stop and save profile
\`\`\`

### State management
\`\`\`bash
agent-browser state save auth.json    # Save auth state
agent-browser state load auth.json    # Load auth state
agent-browser state list              # List saved state files
agent-browser state show <file>       # Show state summary
agent-browser state rename <old> <new>  # Rename state file
agent-browser state clear [name]      # Clear states for session
agent-browser state clear --all       # Clear all saved states
agent-browser state clean --older-than <days>  # Delete old states
\`\`\`

### Setup
\`\`\`bash
agent-browser install                 # Download Chromium browser
agent-browser install --with-deps     # Also install system deps (Linux)
\`\`\`

## Global Options

| Option | Description |
|--------|-------------|
| \`--session <name>\` | Isolated browser session (\`AGENT_BROWSER_SESSION\` env) |
| \`--session-name <name>\` | Auto-save/restore session state (\`AGENT_BROWSER_SESSION_NAME\` env) |
| \`--profile <path>\` | Persistent browser profile (\`AGENT_BROWSER_PROFILE\` env) |
| \`--state <path>\` | Load storage state from JSON file (\`AGENT_BROWSER_STATE\` env) |
| \`--headers <json>\` | HTTP headers scoped to URL's origin |
| \`--executable-path <path>\` | Custom browser binary (\`AGENT_BROWSER_EXECUTABLE_PATH\` env) |
| \`--extension <path>\` | Load browser extension (repeatable; \`AGENT_BROWSER_EXTENSIONS\` env) |
| \`--args <args>\` | Browser launch args (\`AGENT_BROWSER_ARGS\` env) |
| \`--user-agent <ua>\` | Custom User-Agent (\`AGENT_BROWSER_USER_AGENT\` env) |
| \`--proxy <url>\` | Proxy server (\`AGENT_BROWSER_PROXY\` env) |
| \`--proxy-bypass <hosts>\` | Hosts to bypass proxy (\`AGENT_BROWSER_PROXY_BYPASS\` env) |
| \`--ignore-https-errors\` | Ignore HTTPS certificate errors |
| \`--allow-file-access\` | Allow file:// URLs to access local files |
| \`-p, --provider <name>\` | Cloud browser provider (\`AGENT_BROWSER_PROVIDER\` env) |
| \`--device <name>\` | iOS device name (\`AGENT_BROWSER_IOS_DEVICE\` env) |
| \`--json\` | Machine-readable JSON output |
| \`--full, -f\` | Full page screenshot |
| \`--annotate\` | Annotated screenshot with numbered labels (\`AGENT_BROWSER_ANNOTATE\` env) |
| \`--headed\` | Show browser window (\`AGENT_BROWSER_HEADED\` env) |
| \`--cdp <port\\|wss://url>\` | Connect via Chrome DevTools Protocol |
| \`--auto-connect\` | Auto-discover running Chrome (\`AGENT_BROWSER_AUTO_CONNECT\` env) |
| \`--color-scheme <scheme>\` | Color scheme: dark, light, no-preference (\`AGENT_BROWSER_COLOR_SCHEME\` env) |
| \`--download-path <path>\` | Default download directory (\`AGENT_BROWSER_DOWNLOAD_PATH\` env) |
| \`--native\` | [Experimental] Use native Rust daemon (\`AGENT_BROWSER_NATIVE\` env) |
| \`--config <path>\` | Custom config file (\`AGENT_BROWSER_CONFIG\` env) |
| \`--debug\` | Debug output |

### Security options
| Option | Description |
|--------|-------------|
| \`--content-boundaries\` | Wrap page output in boundary markers (\`AGENT_BROWSER_CONTENT_BOUNDARIES\` env) |
| \`--max-output <chars>\` | Truncate page output to N characters (\`AGENT_BROWSER_MAX_OUTPUT\` env) |
| \`--allowed-domains <list>\` | Comma-separated allowed domain patterns (\`AGENT_BROWSER_ALLOWED_DOMAINS\` env) |
| \`--action-policy <path>\` | Path to action policy JSON file (\`AGENT_BROWSER_ACTION_POLICY\` env) |
| \`--confirm-actions <list>\` | Action categories requiring confirmation (\`AGENT_BROWSER_CONFIRM_ACTIONS\` env) |

## Configuration file

Create \`agent-browser.json\` for persistent defaults (no need to repeat flags):

**Locations (lowest to highest priority):**
1. \`~/.agent-browser/config.json\` - user-level defaults
2. \`./agent-browser.json\` - project-level overrides
3. \`AGENT_BROWSER_*\` environment variables
4. CLI flags override everything

\`\`\`json
{
  "headed": true,
  "proxy": "http://localhost:8080",
  "profile": "./browser-data",
  "native": true
}
\`\`\`

## Example: Form submission

\`\`\`bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
\`\`\`

## Example: Authentication with saved state

\`\`\`bash
# Login once
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Later sessions: load saved state
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
\`\`\`

### Header-based Auth (Skip login flows)
\`\`\`bash
# Headers scoped to api.example.com only
agent-browser open api.example.com --headers '{"Authorization": "Bearer <token>"}'
# Navigate to another domain - headers NOT sent (safe)
agent-browser open other-site.com
# Global headers (all domains)
agent-browser set headers '{"X-Custom-Header": "value"}'
\`\`\`

### Authentication Vault
\`\`\`bash
# Store credentials locally (encrypted). The LLM never sees passwords.
echo "pass" | agent-browser auth save github --url https://github.com/login --username user --password-stdin
agent-browser auth login github
\`\`\`

## Sessions & Persistent Profiles

### Sessions (parallel browsers)
\`\`\`bash
agent-browser --session test1 open site-a.com
agent-browser --session test2 open site-b.com
agent-browser session list
\`\`\`

### Session persistence (auto-save/restore)
\`\`\`bash
agent-browser --session-name twitter open twitter.com
# Login once, state persists automatically across restarts
# State files stored in ~/.agent-browser/sessions/
\`\`\`

### Persistent Profiles
Persists cookies, localStorage, IndexedDB, service workers, cache, login sessions across browser restarts.
\`\`\`bash
agent-browser --profile ~/.myapp-profile open myapp.com
# Or via env var
AGENT_BROWSER_PROFILE=~/.myapp-profile agent-browser open myapp.com
\`\`\`

## JSON output (for parsing)

Add \`--json\` for machine-readable output:
\`\`\`bash
agent-browser snapshot -i --json
agent-browser get text @e1 --json
\`\`\`

## Local files

\`\`\`bash
agent-browser --allow-file-access open file:///path/to/document.pdf
agent-browser --allow-file-access open file:///path/to/page.html
\`\`\`

## CDP Mode

\`\`\`bash
agent-browser connect 9222                                          # Local CDP port
agent-browser --cdp 9222 snapshot                                   # Direct CDP on each command
agent-browser --cdp "wss://browser-service.com/cdp?token=..." snapshot  # Remote via WebSocket
agent-browser --auto-connect snapshot                               # Auto-discover running Chrome
\`\`\`

## Cloud providers

\`\`\`bash
# Browserbase
BROWSERBASE_API_KEY="key" BROWSERBASE_PROJECT_ID="id" agent-browser -p browserbase open example.com

# Browser Use
BROWSER_USE_API_KEY="key" agent-browser -p browseruse open example.com

# Kernel
KERNEL_API_KEY="key" agent-browser -p kernel open example.com
\`\`\`

## iOS Simulator

\`\`\`bash
agent-browser device list                                        # List available simulators
agent-browser -p ios --device "iPhone 16 Pro" open example.com   # Launch Safari
agent-browser -p ios snapshot -i                                 # Same commands as desktop
agent-browser -p ios tap @e1                                     # Tap
agent-browser -p ios swipe up                                    # Mobile-specific
agent-browser -p ios close                                       # Close session
\`\`\`

## Native Mode (Experimental)

Pure Rust daemon using direct CDP - no Node.js/Playwright required:
\`\`\`bash
agent-browser --native open example.com
# Or: export AGENT_BROWSER_NATIVE=1
# Or: {"native": true} in agent-browser.json
\`\`\`

---
Install: \`bun add -g agent-browser && agent-browser install\`. Run \`agent-browser --help\` for all commands. Repo: https://github.com/vercel-labs/agent-browser`,
  allowedTools: ["Bash(agent-browser:*)"]
};
// vendor/omo-standalone/packages/skills-core/src/skills/playwright-cli.ts
var playwrightCliSkill = {
  name: "playwright",
  description: "MUST USE for any browser-related tasks. Browser automation via playwright-cli - verification, browsing, information gathering, web scraping, testing, screenshots, and all browser interactions.",
  template: `# Browser Automation with playwright-cli

## Quick start

\`\`\`bash
# open new browser
playwright-cli open
# navigate to a page
playwright-cli goto https://playwright.dev
# interact with the page using refs from the snapshot
playwright-cli click e15
playwright-cli type "page.click"
playwright-cli press Enter
# take a screenshot
playwright-cli screenshot
# close the browser
playwright-cli close
\`\`\`

## Commands

### Core

\`\`\`bash
playwright-cli open
# open and navigate right away
playwright-cli open https://example.com/
playwright-cli goto https://playwright.dev
playwright-cli type "search query"
playwright-cli click e3
playwright-cli dblclick e7
playwright-cli fill e5 "user@example.com"
playwright-cli drag e2 e8
playwright-cli hover e4
playwright-cli select e9 "option-value"
playwright-cli upload ./document.pdf
playwright-cli check e12
playwright-cli uncheck e12
playwright-cli snapshot
playwright-cli snapshot --filename=after-click.yaml
playwright-cli eval "document.title"
playwright-cli eval "el => el.textContent" e5
playwright-cli dialog-accept
playwright-cli dialog-accept "confirmation text"
playwright-cli dialog-dismiss
playwright-cli resize 1920 1080
playwright-cli close
\`\`\`

### Navigation

\`\`\`bash
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
\`\`\`

### Keyboard

\`\`\`bash
playwright-cli press Enter
playwright-cli press ArrowDown
playwright-cli keydown Shift
playwright-cli keyup Shift
\`\`\`

### Mouse

\`\`\`bash
playwright-cli mousemove 150 300
playwright-cli mousedown
playwright-cli mousedown right
playwright-cli mouseup
playwright-cli mouseup right
playwright-cli mousewheel 0 100
\`\`\`

### Save as

\`\`\`bash
playwright-cli screenshot
playwright-cli screenshot e5
playwright-cli screenshot --filename=page.png
playwright-cli pdf --filename=page.pdf
\`\`\`

### Tabs

\`\`\`bash
playwright-cli tab-list
playwright-cli tab-new
playwright-cli tab-new https://example.com/page
playwright-cli tab-close
playwright-cli tab-close 2
playwright-cli tab-select 0
\`\`\`

### Storage

\`\`\`bash
playwright-cli state-save
playwright-cli state-save auth.json
playwright-cli state-load auth.json

# Cookies
playwright-cli cookie-list
playwright-cli cookie-list --domain=example.com
playwright-cli cookie-get session_id
playwright-cli cookie-set session_id abc123
playwright-cli cookie-set session_id abc123 --domain=example.com --httpOnly --secure
playwright-cli cookie-delete session_id
playwright-cli cookie-clear

# LocalStorage
playwright-cli localstorage-list
playwright-cli localstorage-get theme
playwright-cli localstorage-set theme dark
playwright-cli localstorage-delete theme
playwright-cli localstorage-clear

# SessionStorage
playwright-cli sessionstorage-list
playwright-cli sessionstorage-get step
playwright-cli sessionstorage-set step 3
playwright-cli sessionstorage-delete step
playwright-cli sessionstorage-clear
\`\`\`

### Network

\`\`\`bash
playwright-cli route "**/*.jpg" --status=404
playwright-cli route "https://api.example.com/**" --body='{"mock": true}'
playwright-cli route-list
playwright-cli unroute "**/*.jpg"
playwright-cli unroute
\`\`\`

### DevTools

\`\`\`bash
playwright-cli console
playwright-cli console warning
playwright-cli network
playwright-cli run-code "async page => await page.context().grantPermissions(['geolocation'])"
playwright-cli tracing-start
playwright-cli tracing-stop
playwright-cli video-start
playwright-cli video-stop video.webm
\`\`\`

### Install

\`\`\`bash
playwright-cli install --skills
playwright-cli install-browser
\`\`\`

### Configuration
\`\`\`bash
# Use specific browser when creating session
playwright-cli open --browser=chrome
playwright-cli open --browser=firefox
playwright-cli open --browser=webkit
playwright-cli open --browser=msedge
# Connect to browser via extension
playwright-cli open --extension

# Use persistent profile (by default profile is in-memory)
playwright-cli open --persistent
# Use persistent profile with custom directory
playwright-cli open --profile=/path/to/profile

# Start with config file
playwright-cli open --config=my-config.json

# Close the browser
playwright-cli close
# Delete user data for the default session
playwright-cli delete-data
\`\`\`

### Browser Sessions

\`\`\`bash
# create new browser session named "mysession" with persistent profile
playwright-cli -s=mysession open example.com --persistent
# same with manually specified profile directory (use when requested explicitly)
playwright-cli -s=mysession open example.com --profile=/path/to/profile
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close  # stop a named browser
playwright-cli -s=mysession delete-data  # delete user data for persistent session

playwright-cli list
# Close all browsers
playwright-cli close-all
# Forcefully kill all browser processes
playwright-cli kill-all
\`\`\`

## Example: Form submission

\`\`\`bash
playwright-cli open https://example.com/form
playwright-cli snapshot

playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
\`\`\`

## Example: Multi-tab workflow

\`\`\`bash
playwright-cli open https://example.com
playwright-cli tab-new https://example.com/other
playwright-cli tab-list
playwright-cli tab-select 0
playwright-cli snapshot
playwright-cli close
\`\`\`

## Example: Debugging with DevTools

\`\`\`bash
playwright-cli open https://example.com
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli console
playwright-cli network
playwright-cli close
\`\`\`

\`\`\`bash
playwright-cli open https://example.com
playwright-cli tracing-start
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli tracing-stop
playwright-cli close
\`\`\`

## Specific tasks

* **Request mocking** [references/request-mocking.md](references/request-mocking.md)
* **Running Playwright code** [references/running-code.md](references/running-code.md)
* **Browser session management** [references/session-management.md](references/session-management.md)
* **Storage state (cookies, localStorage)** [references/storage-state.md](references/storage-state.md)
* **Test generation** [references/test-generation.md](references/test-generation.md)
* **Tracing** [references/tracing.md](references/tracing.md)
* **Video recording** [references/video-recording.md](references/video-recording.md)`,
  allowedTools: ["Bash(playwright-cli:*)"]
};
// vendor/omo-standalone/packages/skills-core/src/skills/frontend-ui-ux.ts
var frontendUiUxSkill = {
  name: "frontend-ui-ux",
  description: "Designer-turned-developer who crafts stunning UI/UX even without design mockups",
  template: `# Role: Designer-Turned-Developer

You are a designer who learned to code. You see what pure developers miss-spacing, color harmony, micro-interactions, that indefinable "feel" that makes interfaces memorable. Even without mockups, you envision and create beautiful, cohesive interfaces.

**Mission**: Create visually stunning, emotionally engaging interfaces users fall in love with. Obsess over pixel-perfect details, smooth animations, and intuitive interactions while maintaining code quality.

---

# Work Principles

1. **Complete what's asked** - Execute the exact task. No scope creep. Work until it works. Never mark work complete without proper verification.
2. **Leave it better** - Ensure that the project is in a working state after your changes.
3. **Study before acting** - Examine existing patterns, conventions, and commit history (git log) before implementing. Understand why code is structured the way it is.
4. **Blend seamlessly** - Match existing code patterns. Your code should look like the team wrote it.
5. **Be transparent** - Announce each step. Explain reasoning. Report both successes and failures.

---

# Design Process

Before coding, commit to a **BOLD aesthetic direction**:

1. **Purpose**: What problem does this solve? Who uses it?
2. **Tone**: Pick an extreme-brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian
3. **Constraints**: Technical requirements (framework, performance, accessibility)
4. **Differentiation**: What's the ONE thing someone will remember?

**Key**: Choose a clear direction and execute with precision. Intentionality > intensity.

Then implement working code (HTML/CSS/JS, React, Vue, Angular, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

---

# Aesthetic Guidelines

## Typography
Choose distinctive fonts. **Avoid**: Arial, Inter, Roboto, system fonts, Space Grotesk. Pair a characterful display font with a refined body font.

## Color
Commit to a cohesive palette. Use CSS variables. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. **Avoid**: purple gradients on white (AI slop).

## Motion
Focus on high-impact moments. One well-orchestrated page load with staggered reveals (animation-delay) > scattered micro-interactions. Use scroll-triggering and hover states that surprise. Prioritize CSS-only. Use Motion library for React when available.

## Spatial Composition
Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.

## Visual Details
Create atmosphere and depth-gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, grain overlays. Never default to solid colors.

---

# Anti-Patterns (NEVER)

- Generic fonts (Inter, Roboto, Arial, system fonts, Space Grotesk)
- Cliched color schemes (purple gradients on white)
- Predictable layouts and component patterns
- Cookie-cutter design lacking context-specific character
- Converging on common choices across generations

---

# Execution

Match implementation complexity to aesthetic vision:
- **Maximalist** \u2192 Elaborate code with extensive animations and effects
- **Minimalist** \u2192 Restraint, precision, careful spacing and typography

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. You are capable of extraordinary creative work-don't hold back.`
};
// vendor/omo-standalone/packages/skills-core/src/skills/git-master-skill-metadata.ts
var GIT_MASTER_SKILL_NAME = "git-master";
var GIT_MASTER_SKILL_DESCRIPTION = "MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). STRONGLY RECOMMENDED: Use with task(category='quick', load_skills=['git-master'], ...) to save context. Triggers: 'commit', 'rebase', 'squash', 'who wrote', 'when was X added', 'find the commit that'.";

// vendor/omo-standalone/packages/skills-core/src/skills/git-master-sections/commit-workflow.ts
var GIT_MASTER_COMMIT_WORKFLOW_SECTION = `## PHASE 0: Parallel Context Gathering (MANDATORY FIRST STEP)

<parallel_analysis>
**Execute ALL of the following commands IN PARALLEL to minimize latency:**

\`\`\`bash
# Group 1: Current state
git status
git diff --staged --stat
git diff --stat

# Group 2: History context  
git log -30 --oneline
git log -30 --pretty=format:"%s"

# Group 3: Branch context
git branch --show-current
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null)..HEAD 2>/dev/null
\`\`\`

**Capture these data points simultaneously:**
1. What files changed (staged vs unstaged)
2. Recent 30 commit messages for style detection
3. Branch position relative to main/master
4. Whether branch has upstream tracking
5. Commits that would go in PR (local only)
</parallel_analysis>

---

## PHASE 1: Style Detection (BLOCKING - MUST OUTPUT BEFORE PROCEEDING)

<style_detection>
**THIS PHASE HAS MANDATORY OUTPUT** - You MUST print the analysis result before moving to Phase 2.

### 1.1 Language Profile Detection

\`\`\`
Count from git log -30:
- Dominant language/script patterns: N commits
- Secondary language/script patterns: M commits
- Mixed/ambiguous: K commits

DECISION:
- Preserve the dominant repository language pattern in commit messages
- If multiple languages are common, follow the nearest recent examples for the same module
- Never restrict output to specific languages; support any language used by the repo (e.g., Japanese, Korean, English, etc.)
\`\`\`

### 1.2 Commit Style Classification

| Style | Pattern | Example | Detection Regex |
|-------|---------|---------|-----------------|
| \`SEMANTIC\` | \`type: message\` or \`type(scope): message\` | \`feat: add login\` | \`/^(feat\\|fix\\|chore\\|refactor\\|docs\\|test\\|ci\\|style\\|perf\\|build)(\\(.+\\))?:/\` |
| \`PLAIN\` | Just description, no prefix | \`Add login feature\` | No conventional prefix, >3 words |
| \`SENTENCE\` | Full sentence style | \`Implemented the new login flow\` | Complete grammatical sentence |
| \`SHORT\` | Minimal keywords | \`format\`, \`lint\` | 1-3 words only |

**Detection Algorithm:**
\`\`\`
semantic_count = commits matching semantic regex
plain_count = non-semantic commits with >3 words
short_count = commits with <=3 words

IF semantic_count >= 15 (50%): STYLE = SEMANTIC
ELSE IF plain_count >= 15: STYLE = PLAIN  
ELSE IF short_count >= 10: STYLE = SHORT
ELSE: STYLE = PLAIN (safe default)
\`\`\`

### 1.3 MANDATORY OUTPUT (BLOCKING)

**You MUST output this block before proceeding to Phase 2. NO EXCEPTIONS.**

\`\`\`
STYLE DETECTION RESULT
======================
Analyzed: 30 commits from git log

Language profile: [DOMINANT_LANGUAGE_OR_SCRIPT]
  - Dominant pattern: N (X%)
  - Secondary pattern: M (Y%)

Style: [SEMANTIC | PLAIN | SENTENCE | SHORT]
  - Semantic (feat:, fix:, etc): N (X%)
  - Plain: M (Y%)
  - Short: K (Z%)

Reference examples from repo:
  1. "actual commit message from log"
  2. "actual commit message from log"
  3. "actual commit message from log"

All commits will follow: [DOMINANT_LANGUAGE_OR_SCRIPT] + [STYLE]
\`\`\`

**IF YOU SKIP THIS OUTPUT, YOUR COMMITS WILL BE WRONG. STOP AND REDO.**
</style_detection>

---

## PHASE 2: Branch Context Analysis

<branch_analysis>
### 2.1 Determine Branch State

\`\`\`
BRANCH_STATE:
  current_branch: <name>
  has_upstream: true | false
  commits_ahead: N  # Local-only commits
  merge_base: <hash>
  
REWRITE_SAFETY:
  - If has_upstream AND commits_ahead > 0 AND already pushed:
    -> WARN before force push
  - If no upstream OR all commits local:
    -> Safe for aggressive rewrite (fixup, reset, rebase)
  - If on main/master:
    -> NEVER rewrite, only new commits
\`\`\`

### 2.2 History Rewrite Strategy Decision

\`\`\`
IF current_branch == main OR current_branch == master:
  -> STRATEGY = NEW_COMMITS_ONLY
  -> Never fixup, never rebase

ELSE IF commits_ahead == 0:
  -> STRATEGY = NEW_COMMITS_ONLY
  -> No history to rewrite

ELSE IF all commits are local (not pushed):
  -> STRATEGY = AGGRESSIVE_REWRITE
  -> Fixup freely, reset if needed, rebase to clean

ELSE IF pushed but not merged:
  -> STRATEGY = CAREFUL_REWRITE  
  -> Fixup OK but warn about force push
\`\`\`
</branch_analysis>

---

## PHASE 3: Atomic Unit Planning (BLOCKING - MUST OUTPUT BEFORE PROCEEDING)

<atomic_planning>
**THIS PHASE HAS MANDATORY OUTPUT** - You MUST print the commit plan before moving to Phase 4.

### 3.0 Calculate Minimum Commit Count FIRST

\`\`\`
FORMULA: min_commits = ceil(file_count / 3)

 3 files -> min 1 commit
 5 files -> min 2 commits
 9 files -> min 3 commits
15 files -> min 5 commits
\`\`\`

**If your planned commit count < min_commits -> WRONG. SPLIT MORE.**

### 3.1 Split by Directory/Module FIRST (Primary Split)

**RULE: Different directories = Different commits (almost always)**

\`\`\`
Example: 8 changed files
  - app/[locale]/page.tsx
  - app/[locale]/layout.tsx
  - components/demo/browser-frame.tsx
  - components/demo/shopify-full-site.tsx
  - components/pricing/pricing-table.tsx
  - e2e/navbar.spec.ts
  - messages/en.json
  - messages/ko.json

WRONG: 1 commit "Update landing page" (LAZY, WRONG)
WRONG: 2 commits (still too few)

CORRECT: Split by directory/concern:
  - Commit 1: app/[locale]/page.tsx + layout.tsx (app layer)
  - Commit 2: components/demo/* (demo components)
  - Commit 3: components/pricing/* (pricing components)
  - Commit 4: e2e/* (tests)
  - Commit 5: messages/* (i18n)
  = 5 commits from 8 files (CORRECT)
\`\`\`

### 3.2 Split by Concern SECOND (Secondary Split)

**Within same directory, split by logical concern:**

\`\`\`
Example: components/demo/ has 4 files
  - browser-frame.tsx (UI frame)
  - shopify-full-site.tsx (specific demo)
  - review-dashboard.tsx (NEW - specific demo)
  - tone-settings.tsx (NEW - specific demo)

Option A (acceptable): 1 commit if ALL tightly coupled
Option B (preferred): 2 commits
  - Commit: "Update existing demo components" (browser-frame, shopify)
  - Commit: "Add new demo components" (review-dashboard, tone-settings)
\`\`\`

### 3.3 NEVER Do This (Anti-Pattern Examples)

\`\`\`
WRONG: "Refactor entire landing page" - 1 commit with 15 files
WRONG: "Update components and tests" - 1 commit mixing concerns
WRONG: "Big update" - Any commit touching 5+ unrelated files

RIGHT: Multiple focused commits, each 1-4 files max
RIGHT: Each commit message describes ONE specific change
RIGHT: A reviewer can understand each commit in 30 seconds
\`\`\`

### 3.4 Implementation + Test Pairing (MANDATORY)

\`\`\`
RULE: Test files MUST be in same commit as implementation

Test patterns to match:
- test_*.py <-> *.py
- *_test.py <-> *.py
- *.test.ts <-> *.ts
- *.spec.ts <-> *.ts
- __tests__/*.ts <-> *.ts
- tests/*.py <-> src/*.py
\`\`\`

### 3.5 MANDATORY JUSTIFICATION (Before Creating Commit Plan)

**NON-NEGOTIABLE: Before finalizing your commit plan, you MUST:**

\`\`\`
FOR EACH planned commit with 3+ files:
  1. List all files in this commit
  2. Write ONE sentence explaining why they MUST be together
  3. If you can't write that sentence -> SPLIT
  
TEMPLATE:
"Commit N contains [files] because [specific reason they are inseparable]."

VALID reasons:
  VALID: "implementation file + its direct test file"
  VALID: "type definition + the only file that uses it"
  VALID: "migration + model change (would break without both)"
  
INVALID reasons (MUST SPLIT instead):
  INVALID: "all related to feature X" (too vague)
  INVALID: "part of the same PR" (not a reason)
  INVALID: "they were changed together" (not a reason)
  INVALID: "makes sense to group" (not a reason)
\`\`\`

**OUTPUT THIS JUSTIFICATION in your analysis before executing commits.**

### 3.7 Dependency Ordering

\`\`\`
Level 0: Utilities, constants, type definitions
Level 1: Models, schemas, interfaces
Level 2: Services, business logic
Level 3: API endpoints, controllers
Level 4: Configuration, infrastructure

COMMIT ORDER: Level 0 -> Level 1 -> Level 2 -> Level 3 -> Level 4
\`\`\`

### 3.8 Create Commit Groups

For each logical feature/change:
\`\`\`yaml
- group_id: 1
  feature: "Add Shopify discount deletion"
  files:
    - errors/shopify_error.py
    - types/delete_input.py
    - mutations/update_contract.py
    - tests/test_update_contract.py
  dependency_level: 2
  target_commit: null | <existing-hash>  # null = new, hash = fixup
\`\`\`

### 3.9 MANDATORY OUTPUT (BLOCKING)

**You MUST output this block before proceeding to Phase 4. NO EXCEPTIONS.**

\`\`\`
COMMIT PLAN
===========
Files changed: N
Minimum commits required: ceil(N/3) = M
Planned commits: K
Status: K >= M (PASS) | K < M (FAIL - must split more)

COMMIT 1: [message in detected style]
  - path/to/file1.py
  - path/to/file1_test.py
  Justification: implementation + its test

COMMIT 2: [message in detected style]
  - path/to/file2.py
  Justification: independent utility function

COMMIT 3: [message in detected style]
  - config/settings.py
  - config/constants.py
  Justification: tightly coupled config changes

Execution order: Commit 1 -> Commit 2 -> Commit 3
(follows dependency: Level 0 -> Level 1 -> Level 2 -> ...)
\`\`\`

**VALIDATION BEFORE EXECUTION:**
- Each commit has <=4 files (or justified)
- Each commit message matches detected STYLE + LANGUAGE
- Test files paired with implementation
- Different directories = different commits (or justified)
- Total commits >= min_commits

**IF ANY CHECK FAILS, DO NOT PROCEED. REPLAN.**
</atomic_planning>

---

## PHASE 4: Commit Strategy Decision

<strategy_decision>
### 4.1 For Each Commit Group, Decide:

\`\`\`
FIXUP if:
  - Change complements existing commit's intent
  - Same feature, fixing bugs or adding missing parts
  - Review feedback incorporation
  - Target commit exists in local history

NEW COMMIT if:
  - New feature or capability
  - Independent logical unit
  - Different issue/ticket
  - No suitable target commit exists
\`\`\`

### 4.2 History Rebuild Decision (Aggressive Option)

\`\`\`
CONSIDER RESET & REBUILD when:
  - History is messy (many small fixups already)
  - Commits are not atomic (mixed concerns)
  - Dependency order is wrong
  
RESET WORKFLOW:
  1. git reset --soft $(git merge-base HEAD main)
  2. All changes now staged
  3. Re-commit in proper atomic units
  4. Clean history from scratch
  
ONLY IF:
  - All commits are local (not pushed)
  - User explicitly allows OR branch is clearly WIP
\`\`\`

### 4.3 Final Plan Summary

\`\`\`yaml
EXECUTION_PLAN:
  strategy: FIXUP_THEN_NEW | NEW_ONLY | RESET_REBUILD
  fixup_commits:
    - files: [...]
      target: <hash>
  new_commits:
    - files: [...]
      message: "..."
      level: N
  requires_force_push: true | false
\`\`\`
</strategy_decision>

---

## PHASE 5: Commit Execution

<execution>
### 5.1 Register TODO Items

Use TodoWrite to register each commit as a trackable item:
\`\`\`
- [ ] Fixup: <description> -> <target-hash>
- [ ] New: <description>
- [ ] Rebase autosquash
- [ ] Final verification
\`\`\`

### 5.2 Fixup Commits (If Any)

\`\`\`bash
# Stage files for each fixup
git add <files>
git commit --fixup=<target-hash>

# Repeat for all fixups...

# Single autosquash rebase at the end
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE
\`\`\`

### 5.3 New Commits (After Fixups)

For each new commit group, in dependency order:

\`\`\`bash
# Stage files
git add <file1> <file2> ...

# Verify staging
git diff --staged --stat

# Commit with detected style
git commit -m "<message-matching-COMMIT_CONFIG>"

# Verify
git log -1 --oneline
\`\`\`

### 5.4 Commit Message Generation

**Based on COMMIT_CONFIG from Phase 1:**

\`\`\`
IF style == SEMANTIC:
  -> Use a semantic prefix + repository language message
  -> Examples:
     - "feat: add login feature"
     - "feat: \u30ED\u30B0\u30A4\u30F3\u6A5F\u80FD\u3092\u8FFD\u52A0"
     - "feat: \uB85C\uADF8\uC778 \uAE30\uB2A5 \uCD94\uAC00"

IF style == PLAIN:
  -> Use plain repository language message without semantic prefix
  -> Examples:
     - "Add login feature"
     - "\u30ED\u30B0\u30A4\u30F3\u6A5F\u80FD\u3092\u8FFD\u52A0"
     - "\uB85C\uADF8\uC778 \uAE30\uB2A5 \uCD94\uAC00"
  
IF style == SHORT:
  -> "format" / "type fix" / "lint"
\`\`\`

**VALIDATION before each commit:**
1. Does message match detected style?
2. Does message use the repository's dominant language/script profile (from Phase 1.1)?
3. Is it similar to examples from git log?

If ANY check fails -> REWRITE message.
\`\`\`
</execution>

---

## PHASE 6: Verification & Cleanup

<verification>
### 6.1 Post-Commit Verification

\`\`\`bash
# Check working directory clean
git status

# Review new history
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)..HEAD

# Verify each commit is atomic
# (mentally check: can each be reverted independently?)
\`\`\`

### 6.2 Force Push Decision

\`\`\`
IF fixup was used AND branch has upstream:
  -> Requires: git push --force-with-lease
  -> WARN user about force push implications
  
IF only new commits:
  -> Regular: git push
\`\`\`

### 6.3 Final Report

\`\`\`
COMMIT SUMMARY:
  Strategy: <what was done>
  Commits created: N
  Fixups merged: M
  
HISTORY:
  <hash1> <message1>
  <hash2> <message2>
  ...

NEXT STEPS:
  - git push [--force-with-lease]
  - Create PR if ready
\`\`\`
</verification>`;

// vendor/omo-standalone/packages/skills-core/src/skills/git-master-sections/history-search-workflow.ts
var GIT_MASTER_HISTORY_SEARCH_WORKFLOW_SECTION = `## HISTORY SEARCH MODE (Phase H1-H3)

## PHASE H1: Determine Search Type

<history_search_type>
### H1.1 Parse User Request

| User Request | Search Type | Tool |
|--------------|-------------|------|
| "when was X added" in any language (e.g., "X\uAC00 \uC5B8\uC81C \uCD94\uAC00\uB410\uC5B4", "X\u306F\u3044\u3064\u8FFD\u52A0\u3055\u308C\u305F") | PICKAXE | \`git log -S\` |
| "find commits changing X pattern" | REGEX | \`git log -G\` |
| "who wrote this line" in any language (e.g., "\uC774 \uC904 \uB204\uAC00 \uC37C\uC5B4", "\u3053\u306E\u884C\u3092\u66F8\u3044\u305F\u306E\u306F\u8AB0") | BLAME | \`git blame\` |
| "when did bug start" in any language (e.g., "\uBC84\uADF8 \uC5B8\uC81C \uC0DD\uACBC\uC5B4", "\u30D0\u30B0\u306F\u3044\u3064\u5165\u3063\u305F") | BISECT | \`git bisect\` |
| "history of file" in any language (e.g., "\uD30C\uC77C \uD788\uC2A4\uD1A0\uB9AC", "\u30D5\u30A1\u30A4\u30EB\u5C65\u6B74") | FILE_LOG | \`git log -- path\` |
| "find deleted code" in any language (e.g., "\uC0AD\uC81C\uB41C \uCF54\uB4DC \uCC3E\uAE30", "\u524A\u9664\u3055\u308C\u305F\u30B3\u30FC\u30C9\u3092\u63A2\u3059") | PICKAXE_ALL | \`git log -S --all\` |

### H1.2 Extract Search Parameters

\`\`\`
From user request, identify:
- SEARCH_TERM: The string/pattern to find
- FILE_SCOPE: Specific file(s) or entire repo
- TIME_RANGE: All time or specific period
- BRANCH_SCOPE: Current branch or --all branches
\`\`\`
</history_search_type>

---

## PHASE H2: Execute Search

<history_search_exec>
### H2.1 Pickaxe Search (git log -S)

**Purpose**: Find commits that ADD or REMOVE a specific string

\`\`\`bash
# Basic: Find when string was added/removed
git log -S "searchString" --oneline

# With context (see the actual changes):
git log -S "searchString" -p

# In specific file:
git log -S "searchString" -- path/to/file.py

# Across all branches (find deleted code):
git log -S "searchString" --all --oneline

# With date range:
git log -S "searchString" --since="2024-01-01" --oneline

# Case insensitive:
git log -S "searchstring" -i --oneline
\`\`\`

**Example Use Cases:**
\`\`\`bash
# When was this function added?
git log -S "def calculate_discount" --oneline

# When was this constant removed?
git log -S "MAX_RETRY_COUNT" --all --oneline

# Find who introduced a bug pattern
git log -S "== None" -- "*.py" --oneline  # Should be "is None"
\`\`\`

### H2.2 Regex Search (git log -G)

**Purpose**: Find commits where diff MATCHES a regex pattern

\`\`\`bash
# Find commits touching lines matching pattern
git log -G "pattern.*regex" --oneline

# Find function definition changes
git log -G "def\\s+my_function" --oneline -p

# Find import changes
git log -G "^import\\s+requests" -- "*.py" --oneline

# Find TODO additions/removals
git log -G "TODO|FIXME|HACK" --oneline
\`\`\`

**-S vs -G Difference:**
\`\`\`
-S "foo": Finds commits where COUNT of "foo" changed
-G "foo": Finds commits where DIFF contains "foo"

Use -S for: "when was X added/removed"
Use -G for: "what commits touched lines containing X"
\`\`\`

### H2.3 Git Blame

**Purpose**: Line-by-line attribution

\`\`\`bash
# Basic blame
git blame path/to/file.py

# Specific line range
git blame -L 10,20 path/to/file.py

# Show original commit (ignoring moves/copies)
git blame -C path/to/file.py

# Ignore whitespace changes
git blame -w path/to/file.py

# Show email instead of name
git blame -e path/to/file.py

# Output format for parsing
git blame --porcelain path/to/file.py
\`\`\`

**Reading Blame Output:**
\`\`\`
^abc1234 (Author Name 2024-01-15 10:30:00 +0900 42) code_line_here
|         |            |                       |    +-- Line content
|         |            |                       +-- Line number
|         |            +-- Timestamp
|         +-- Author
+-- Commit hash (^ means initial commit)
\`\`\`

### H2.4 Git Bisect (Binary Search for Bugs)

**Purpose**: Find exact commit that introduced a bug

\`\`\`bash
# Start bisect session
git bisect start

# Mark current (bad) state
git bisect bad

# Mark known good commit (e.g., last release)
git bisect good v1.0.0

# Git checkouts middle commit. Test it, then:
git bisect good  # if this commit is OK
git bisect bad   # if this commit has the bug

# Repeat until git finds the culprit commit
# Git will output: "abc1234 is the first bad commit"

# When done, return to original state
git bisect reset
\`\`\`

**Automated Bisect (with test script):**
\`\`\`bash
# If you have a test that fails on bug:
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
git bisect run pytest tests/test_specific.py

# Git runs test on each commit automatically
# Exits 0 = good, exits 1-127 = bad, exits 125 = skip
\`\`\`

### H2.5 File History Tracking

\`\`\`bash
# Full history of a file
git log --oneline -- path/to/file.py

# Follow file across renames
git log --follow --oneline -- path/to/file.py

# Show actual changes
git log -p -- path/to/file.py

# Files that no longer exist
git log --all --full-history -- "**/deleted_file.py"

# Who changed file most
git shortlog -sn -- path/to/file.py
\`\`\`
</history_search_exec>

---

## PHASE H3: Present Results

<history_results>
### H3.1 Format Search Results

\`\`\`
SEARCH QUERY: "<what user asked>"
SEARCH TYPE: <PICKAXE | REGEX | BLAME | BISECT | FILE_LOG>
COMMAND USED: git log -S "..." ...

RESULTS:
  Commit       Date           Message
  ---------    ----------     --------------------------------
  abc1234      2024-06-15     feat: add discount calculation
  def5678      2024-05-20     refactor: extract pricing logic

MOST RELEVANT COMMIT: abc1234
DETAILS:
  Author: John Doe <john@example.com>
  Date: 2024-06-15
  Files changed: 3
  
DIFF EXCERPT (if applicable):
  + def calculate_discount(price, rate):
  +     return price * (1 - rate)
\`\`\`

### H3.2 Provide Actionable Context

Based on search results, offer relevant follow-ups:

\`\`\`
FOUND THAT commit abc1234 introduced the change.

POTENTIAL ACTIONS:
- View full commit: git show abc1234
- Revert this commit: git revert abc1234
- See related commits: git log --ancestry-path abc1234..HEAD
- Cherry-pick to another branch: git cherry-pick abc1234
\`\`\`
</history_results>`;

// vendor/omo-standalone/packages/skills-core/src/skills/git-master-sections/overview.ts
var GIT_MASTER_OVERVIEW_SECTION = `# Git Master Agent

You are a Git expert combining three specializations:
1. **Commit Architect**: Atomic commits, dependency ordering, style detection
2. **Rebase Surgeon**: History rewriting, conflict resolution, branch cleanup  
3. **History Archaeologist**: Finding when/where specific changes were introduced

---

## MODE DETECTION (FIRST STEP)

Analyze the user's request to determine operation mode:

| User Request Pattern | Mode | Jump To |
|---------------------|------|---------|
| Commit intent in any language (e.g., "commit", "\uCEE4\uBC0B", "\u30B3\u30DF\u30C3\u30C8") | \`COMMIT\` | Phase 0-6 (existing) |
| Rebase/squash intent in any language (e.g., "rebase", "\uB9AC\uBCA0\uC774\uC2A4", "\u30EA\u30D9\u30FC\u30B9") | \`REBASE\` | Phase R1-R4 |
| History lookup intent in any language (e.g., "find when", "\uC5B8\uC81C \uBC14\uB00C\uC5C8", "\u3044\u3064\u8FFD\u52A0") | \`HISTORY_SEARCH\` | Phase H1-H3 |
| "smart rebase", "rebase onto" | \`REBASE\` | Phase R1-R4 |

**CRITICAL**: Don't default to COMMIT mode. Parse the actual request.

---

## CORE PRINCIPLE: MULTIPLE COMMITS BY DEFAULT (NON-NEGOTIABLE)

<critical_warning>
**ONE COMMIT = AUTOMATIC FAILURE**

Your DEFAULT behavior is to CREATE MULTIPLE COMMITS.
Single commit is a BUG in your logic, not a feature.

**HARD RULE:**
\`\`\`
3+ files changed -> MUST be 2+ commits (NO EXCEPTIONS)
5+ files changed -> MUST be 3+ commits (NO EXCEPTIONS)
10+ files changed -> MUST be 5+ commits (NO EXCEPTIONS)
\`\`\`

**If you're about to make 1 commit from multiple files, YOU ARE WRONG. STOP AND SPLIT.**

**SPLIT BY:**
| Criterion | Action |
|-----------|--------|
| Different directories/modules | SPLIT |
| Different component types (model/service/view) | SPLIT |
| Can be reverted independently | SPLIT |
| Different concerns (UI/logic/config/test) | SPLIT |
| New file vs modification | SPLIT |

**ONLY COMBINE when ALL of these are true:**
- EXACT same atomic unit (e.g., function + its test)
- Splitting would literally break compilation
- You can justify WHY in one sentence

**MANDATORY SELF-CHECK before committing:**
\`\`\`
"I am making N commits from M files."
IF N == 1 AND M > 2:
  -> WRONG. Go back and split.
  -> Write down WHY each file must be together.
  -> If you can't justify, SPLIT.
\`\`\`
</critical_warning>`;

// vendor/omo-standalone/packages/skills-core/src/skills/git-master-sections/quick-reference.ts
var GIT_MASTER_QUICK_REFERENCE_SECTION = `## Quick Reference

### Style Detection Cheat Sheet

| If git log shows... | Use this style |
|---------------------|----------------|
| \`feat: xxx\`, \`fix: yyy\` | SEMANTIC |
| \`Add xxx\`, \`Fix yyy\`, \`xxx \uCD94\uAC00\`, \`xxx\u3092\u8FFD\u52A0\` | PLAIN |
| \`format\`, \`lint\`, \`typo\` | SHORT |
| Full sentences | SENTENCE |
| Mix of above | Use MAJORITY (not semantic by default) |

### Decision Tree

\`\`\`
Is this on main/master?
  YES -> NEW_COMMITS_ONLY, never rewrite
  NO -> Continue

Are all commits local (not pushed)?
  YES -> AGGRESSIVE_REWRITE allowed
  NO -> CAREFUL_REWRITE (warn on force push)

Does change complement existing commit?
  YES -> FIXUP to that commit
  NO -> NEW COMMIT

Is history messy?
  YES + all local -> Consider RESET_REBUILD
  NO -> Normal flow
\`\`\`

### Anti-Patterns (AUTOMATIC FAILURE)

1. **NEVER make one giant commit** - 3+ files MUST be 2+ commits
2. **NEVER default to semantic style** - detect from git log first
3. **NEVER separate test from implementation** - same commit always
4. **NEVER group by file type** - group by feature/module
5. **NEVER rewrite pushed history** without explicit permission
6. **NEVER leave working directory dirty** - complete all changes
7. **NEVER skip JUSTIFICATION** - explain why files are grouped
8. **NEVER use vague grouping reasons** - "related to X" is NOT valid

---

## FINAL CHECK BEFORE EXECUTION (BLOCKING)

\`\`\`
STOP AND VERIFY - Do not proceed until ALL boxes checked:

[] File count check: N files -> at least ceil(N/3) commits?
  - 3 files -> min 1 commit
  - 5 files -> min 2 commits
  - 10 files -> min 4 commits
  - 20 files -> min 7 commits

[] Justification check: For each commit with 3+ files, did I write WHY?

[] Directory split check: Different directories -> different commits?

[] Test pairing check: Each test with its implementation?

[] Dependency order check: Foundations before dependents?
\`\`\`

**HARD STOP CONDITIONS:**
- Making 1 commit from 3+ files -> **WRONG. SPLIT.**
- Making 2 commits from 10+ files -> **WRONG. SPLIT MORE.**
- Can't justify file grouping in one sentence -> **WRONG. SPLIT.**
- Different directories in same commit (without justification) -> **WRONG. SPLIT.**

---

### Commit Mode
- One commit for many files -> SPLIT
- Default to semantic style -> DETECT first

### Rebase Mode
- Rebase main/master -> NEVER
- \`--force\` instead of \`--force-with-lease\` -> DANGEROUS
- Rebase without stashing dirty files -> WILL FAIL

### History Search Mode
- \`-S\` when \`-G\` is appropriate -> Wrong results
- Blame without \`-C\` on moved code -> Wrong attribution
- Bisect without proper good/bad boundaries -> Wasted time`;

// vendor/omo-standalone/packages/skills-core/src/skills/git-master-sections/rebase-workflow.ts
var GIT_MASTER_REBASE_WORKFLOW_SECTION = `## REBASE MODE (Phase R1-R4)

## PHASE R1: Rebase Context Analysis

<rebase_context>
### R1.1 Parallel Information Gathering

\`\`\`bash
# Execute ALL in parallel
git branch --show-current
git log --oneline -20
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
git status --porcelain
git stash list
\`\`\`

### R1.2 Safety Assessment

| Condition | Risk Level | Action |
|-----------|------------|--------|
| On main/master | CRITICAL | **ABORT** - never rebase main |
| Dirty working directory | WARNING | Stash first: \`git stash push -m "pre-rebase"\` |
| Pushed commits exist | WARNING | Will require force-push; confirm with user |
| All commits local | SAFE | Proceed freely |
| Upstream diverged | WARNING | May need \`--onto\` strategy |

### R1.3 Determine Rebase Strategy

\`\`\`
USER REQUEST -> STRATEGY:

"squash commits" intent in any language (e.g., "cleanup", "\uC815\uB9AC", "\u5C65\u6B74\u6574\u7406")
  -> INTERACTIVE_SQUASH

"rebase on main" intent in any language (e.g., "update branch", "\uBA54\uC778\uC5D0 \uB9AC\uBCA0\uC774\uC2A4", "main\u306B\u30EA\u30D9\u30FC\u30B9")
  -> REBASE_ONTO_BASE

"autosquash" / "apply fixups"
  -> AUTOSQUASH

"reorder commits" intent in any language (e.g., "\uCEE4\uBC0B \uC21C\uC11C", "\u30B3\u30DF\u30C3\u30C8\u9806\u3092\u4E26\u3079\u66FF\u3048")
  -> INTERACTIVE_REORDER

"split commit" intent in any language (e.g., "\uCEE4\uBC0B \uBD84\uB9AC", "\u30B3\u30DF\u30C3\u30C8\u5206\u5272")
  -> INTERACTIVE_EDIT
\`\`\`
</rebase_context>

---

## PHASE R2: Rebase Execution

<rebase_execution>
### R2.1 Interactive Rebase (Squash/Reorder)

\`\`\`bash
# Find merge-base
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)

# Start interactive rebase
# NOTE: Cannot use -i interactively. Use GIT_SEQUENCE_EDITOR for automation.

# For SQUASH (combine all into one):
git reset --soft $MERGE_BASE
git commit -m "Combined: <summarize all changes>"

# For SELECTIVE SQUASH (keep some, squash others):
# Use fixup approach - mark commits to squash, then autosquash
\`\`\`

### R2.2 Autosquash Workflow

\`\`\`bash
# When you have fixup! or squash! commits:
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE

# The GIT_SEQUENCE_EDITOR=: trick auto-accepts the rebase todo
# Fixup commits automatically merge into their targets
\`\`\`

### R2.3 Rebase Onto (Branch Update)

\`\`\`bash
# Scenario: Your branch is behind main, need to update

# Simple rebase onto main:
git fetch origin
git rebase origin/main

# Complex: Move commits to different base
# git rebase --onto <newbase> <oldbase> <branch>
git rebase --onto origin/main $(git merge-base HEAD origin/main) HEAD
\`\`\`

### R2.4 Handling Conflicts

\`\`\`
CONFLICT DETECTED -> WORKFLOW:

1. Identify conflicting files:
   git status | grep "both modified"

2. For each conflict:
   - Read the file
   - Understand both versions (HEAD vs incoming)
   - Resolve by editing file
   - Remove conflict markers (<<<<, ====, >>>>)

3. Stage resolved files:
   git add <resolved-file>

4. Continue rebase:
   git rebase --continue

5. If stuck or confused:
   git rebase --abort  # Safe rollback
\`\`\`

### R2.5 Recovery Procedures

| Situation | Command | Notes |
|-----------|---------|-------|
| Rebase going wrong | \`git rebase --abort\` | Returns to pre-rebase state |
| Need original commits | \`git reflog\` -> \`git reset --hard <hash>\` | Reflog keeps 90 days |
| Accidentally force-pushed | \`git reflog\` -> coordinate with team | May need to notify others |
| Lost commits after rebase | \`git fsck --lost-found\` | Nuclear option |
</rebase_execution>

---

## PHASE R3: Post-Rebase Verification

<rebase_verify>
\`\`\`bash
# Verify clean state
git status

# Check new history
git log --oneline $(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)..HEAD

# Verify code still works (if tests exist)
# Run project-specific test command

# Compare with pre-rebase if needed
git diff ORIG_HEAD..HEAD --stat
\`\`\`

### Push Strategy

\`\`\`
IF branch never pushed:
  -> git push -u origin <branch>

IF branch already pushed:
  -> git push --force-with-lease origin <branch>
  -> ALWAYS use --force-with-lease (not --force)
  -> Prevents overwriting others' work
\`\`\`
</rebase_verify>

---

## PHASE R4: Rebase Report

\`\`\`
REBASE SUMMARY:
  Strategy: <SQUASH | AUTOSQUASH | ONTO | REORDER>
  Commits before: N
  Commits after: M
  Conflicts resolved: K
  
HISTORY (after rebase):
  <hash1> <message1>
  <hash2> <message2>

NEXT STEPS:
  - git push --force-with-lease origin <branch>
  - Review changes before merge
\`\`\``;

// vendor/omo-standalone/packages/skills-core/src/skills/git-master.ts
var GIT_MASTER_TEMPLATE = [
  GIT_MASTER_OVERVIEW_SECTION,
  GIT_MASTER_COMMIT_WORKFLOW_SECTION,
  `---
---`,
  GIT_MASTER_REBASE_WORKFLOW_SECTION,
  `---
---`,
  GIT_MASTER_HISTORY_SEARCH_WORKFLOW_SECTION,
  "---",
  GIT_MASTER_QUICK_REFERENCE_SECTION
].join(`

`);
var gitMasterSkill = {
  name: GIT_MASTER_SKILL_NAME,
  description: GIT_MASTER_SKILL_DESCRIPTION,
  template: GIT_MASTER_TEMPLATE
};
// vendor/omo-standalone/packages/skills-core/src/skills/dev-browser.ts
var devBrowserSkill = {
  name: "dev-browser",
  description: "Browser automation with persistent page state. Use when users ask to navigate websites, fill forms, take screenshots, extract web data, test web apps, or automate browser workflows. Trigger phrases include 'go to [url]', 'click on', 'fill out the form', 'take a screenshot', 'scrape', 'automate', 'test the website', 'log into', or any browser interaction request.",
  template: `# Dev Browser Skill

Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally. Once you've proven out part of a workflow and there is repeated work to be done, you can write a script to do the repeated work in a single execution.

## Choosing Your Approach

- **Local/source-available sites**: Read the source code first to write selectors directly
- **Unknown page layouts**: Use \`getAISnapshot()\` to discover elements and \`selectSnapshotRef()\` to interact with them
- **Visual feedback**: Take screenshots to see what the user sees

## Setup

**IMPORTANT**: Before using this skill, ensure the server is running. See [references/installation.md](references/installation.md) for platform-specific setup instructions (macOS, Linux, Windows).

Two modes available. Ask the user if unclear which to use.

### Standalone Mode (Default)

Launches a new Chromium browser for fresh automation sessions.

**macOS/Linux:**
\`\`\`bash
./skills/dev-browser/server.sh &
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "skills/dev-browser/server.js"
\`\`\`

Add \`--headless\` flag if user requests it. **Wait for the \`Ready\` message before running scripts.**

### Extension Mode

Connects to user's existing Chrome browser. Use this when:

- The user is already logged into sites and wants you to do things behind an authed experience that isn't local dev.
- The user asks you to use the extension

**Important**: The core flow is still the same. You create named pages inside of their browser.

**Start the relay server:**

**macOS/Linux:**
\`\`\`bash
cd skills/dev-browser && npm i && npm run start-extension &
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
cd skills/dev-browser; npm i; Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run", "start-extension"
\`\`\`

Wait for \`Waiting for extension to connect...\` followed by \`Extension connected\` in the console.

If the extension hasn't connected yet, tell the user to launch and activate it. Download link: https://github.com/SawyerHood/dev-browser/releases

## Writing Scripts

> **Run all scripts from \`skills/dev-browser/\` directory.** The \`@/\` import alias requires this directory's config.

Execute scripts inline using heredocs:

**macOS/Linux:**
\`\`\`bash
cd skills/dev-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("example", { viewport: { width: 1920, height: 1080 } });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
\`\`\`

**Windows (PowerShell):**
\`\`\`powershell
cd skills/dev-browser
@"
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("example", { viewport: { width: 1920, height: 1080 } });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
"@ | npx tsx --input-type=module
\`\`\`

### Key Principles

1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Descriptive page names**: Use \`"checkout"\`, \`"login"\`, not \`"main"\`
4. **Disconnect to exit**: \`await client.disconnect()\` - pages persist on server
5. **Plain JS in evaluate**: \`page.evaluate()\` runs in browser - no TypeScript syntax

## Workflow Loop

1. **Write a script** to perform one action
2. **Run it** and observe the output
3. **Evaluate** - did it work? What's the current state?
4. **Decide** - is the task complete or do we need another script?
5. **Repeat** until task is done

### No TypeScript in Browser Context

Code passed to \`page.evaluate()\` runs in the browser, which doesn't understand TypeScript:

\`\`\`typescript
// Correct: plain JavaScript
const text = await page.evaluate(() => {
  return document.body.innerText;
});

// Wrong: TypeScript syntax will fail at runtime
const text = await page.evaluate(() => {
  const el: HTMLElement = document.body; // Type annotation breaks in browser!
  return el.innerText;
});
\`\`\`

## Scraping Data

For scraping large datasets, intercept and replay network requests rather than scrolling the DOM. See [references/scraping.md](references/scraping.md) for the complete guide.

## Client API

\`\`\`typescript
const client = await connect();

// Get or create named page
const page = await client.page("name");
const pageWithSize = await client.page("name", { viewport: { width: 1920, height: 1080 } });

const pages = await client.list(); // List all page names
await client.close("name"); // Close a page
await client.disconnect(); // Disconnect (pages persist)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot("name"); // Get accessibility tree
const element = await client.selectSnapshotRef("name", "e5"); // Get element by ref
\`\`\`

## Waiting

\`\`\`typescript
import { waitForPageLoad } from "@/client.js";

await waitForPageLoad(page); // After navigation
await page.waitForSelector(".results"); // For specific elements
await page.waitForURL("**/success"); // For specific URL
\`\`\`

## Screenshots

\`\`\`typescript
await page.screenshot({ path: "tmp/screenshot.png" });
await page.screenshot({ path: "tmp/full.png", fullPage: true });
\`\`\`

## ARIA Snapshot (Element Discovery)

Use \`getAISnapshot()\` to discover page elements. Returns YAML-formatted accessibility tree:

\`\`\`yaml
- banner:
  - link "Hacker News" [ref=e1]
  - navigation:
    - link "new" [ref=e2]
- main:
  - list:
    - listitem:
      - link "Article Title" [ref=e8]
\`\`\`

**Interacting with refs:**

\`\`\`typescript
const snapshot = await client.getAISnapshot("hackernews");
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef("hackernews", "e2");
await element.click();
\`\`\`

## Error Recovery

Page state persists after failures. Debug with:

\`\`\`bash
cd skills/dev-browser && npx tsx <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("hackernews");

await page.screenshot({ path: "tmp/debug.png" });
console.log({
  url: page.url(),
  title: await page.title(),
  bodyText: await page.textContent("body").then((t) => t?.slice(0, 200)),
});

await client.disconnect();
EOF
\`\`\``
};
// vendor/omo-standalone/packages/skills-core/src/skills/review-work.ts
var reviewWorkSkill = {
  name: "review-work",
  description: "Post-implementation review orchestrator. Launches 5 parallel background sub-agents: Oracle (goal/constraint verification), Oracle (code quality), Oracle (security), unspecified-high (hands-on QA execution), unspecified-high (context mining from GitHub/git/Slack/Notion). All must pass for review to pass. MUST USE after completing any significant implementation work. Triggers: 'review work', 'review my work', 'review changes', 'QA my work', 'verify implementation', 'check my work', 'validate changes', 'post-implementation review'.",
  template: `# Review Work - 5-Agent Parallel Review Orchestrator

Launch 5 specialized sub-agents in parallel to review completed implementation work from every angle. All 5 must pass for the review to pass. If even ONE fails, the review fails.

The 5 agents cover complementary concerns - together they form a comprehensive review that no single reviewer could match:

| # | Agent | Type | Role | Focus Level |
|---|-------|------|------|-------------|
| 1 | Goal Verifier | Oracle | Did we build what was asked? | MAIN |
| 2 | QA Executor | unspecified-high | Does it actually work? | MAIN |
| 3 | Code Reviewer | Oracle | Is the code well-written? | MAIN |
| 4 | Security Auditor | Oracle | Is it secure? | SUB |
| 5 | Context Miner | unspecified-high | Did we miss any context? | MAIN |

---

## Phase 0: Gather Review Context

Before launching agents, collect these inputs. Extract from conversation history first - the user's original request, constraints discussed, and decisions made are usually already in the thread. Only ask if truly missing.

<required_inputs>

- **GOAL**: The original objective. What was the user trying to achieve? Pull from the initial request in this conversation.
- **CONSTRAINTS**: Rules, requirements, or limitations. Tech stack restrictions, performance targets, API contracts, design patterns to follow, backward compatibility needs.
- **BACKGROUND**: Why this work was needed. Business context, user stories, related systems, prior decisions that informed the approach.
- **CHANGED_FILES**: Auto-collect via \`git diff --name-only HEAD~1\` or against the appropriate base (branch point, specific commit).
- **DIFF**: Auto-collect via \`git diff HEAD~1\` or against the appropriate base.
- **FILE_CONTENTS**: Read the full content of each changed file (not just the diff). Oracle agents cannot read files - they need full context in the prompt.
- **RUN_COMMAND**: How to start/run the application. Check \`package.json\` scripts, \`Makefile\`, \`docker-compose.yml\`, or ask the user.

</required_inputs>


**NEVER CHECKOUT A PR BRANCH IN THE MAIN WORKTREE. ALWAYS CREATE A NEW GIT WORKTREE (\`git worktree add\`) AND WORK THERE. THIS PREVENTS CONTAMINATING THE USER'S WORKING DIRECTORY WITH UNRELATED BRANCH STATE.**

**Auto-collection sequence:**

\`\`\`bash
# 1. Get changed files
git diff --name-only HEAD~1  # or: git diff --name-only main...HEAD

# 2. Get diff
git diff HEAD~1  # or: git diff main...HEAD

# 3. Detect run command
# Check package.json -> "scripts.dev" or "scripts.start"
# Check Makefile -> default target
# Check docker-compose.yml -> services
\`\`\`

For GOAL, CONSTRAINTS, BACKGROUND - review the full conversation history. The user's original message almost always contains the goal. Constraints often emerge during discussion. If anything critical is ambiguous, ask ONE focused question - not a checklist.

---

## Phase 1: Launch 5 Agents

Launch ALL 5 in a single turn. Every agent uses \`run_in_background=true\`. No sequential launches. No waiting between them.

**Oracle agents receive everything in the prompt** (they cannot read files or run commands). Include DIFF + FILE_CONTENTS + all context directly in the prompt text.

**unspecified-high agents are autonomous** - they can read files, run commands, and use tools. Give them goals and pointers, not raw content dumps.

---

### Agent 1: Goal & Constraint Verification (Oracle) - MAIN

This agent answers: "Did we build exactly what was asked, within the rules we were given?"

\`\`\`
task(
  subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="Verify implementation against original goal and constraints",
  prompt="""
<review_type>GOAL & CONSTRAINT VERIFICATION</review_type>

<original_goal>
{GOAL - paste the user's original request and any clarifications}
</original_goal>

<constraints>
{CONSTRAINTS - every rule, requirement, or limitation discussed}
</constraints>

<background>
{BACKGROUND - why this work was needed, broader context}
</background>

<changed_files>
{CHANGED_FILES - list of modified file paths}
</changed_files>

<file_contents>
{FILE_CONTENTS - full content of every changed file, clearly delimited per file}
</file_contents>

<diff>
{DIFF - the actual git diff}
</diff>

Review whether this implementation correctly and completely achieves the stated goal within the given constraints. Be obsessively thorough - the point of this review is to catch what the implementer missed.

REVIEW CHECKLIST:

1. **Goal Completeness**: Break the goal into every sub-requirement (explicit AND implied). For each, mark ACHIEVED / MISSED / PARTIAL. Missing even one implied requirement that a reasonable engineer would have addressed = PARTIAL at minimum.

2. **Constraint Compliance**: List every constraint. For each, verify compliance with specific code evidence. A constraint violated = automatic FAIL.

3. **Requirement Gaps**: Requirements the user clearly wanted but didn't spell out. Things implied by the goal or background that a thoughtful engineer would have included.

4. **Over-Engineering**: Anything added that wasn't requested - unnecessary abstractions, extra features, premature optimizations, speculative generality. Flag these as scope creep.

5. **Edge Cases**: Given the goal, what inputs or scenarios would break this? Trace through at least 5 edge cases mentally.

6. **Behavioral Correctness**: Walk through the code logic for 3+ representative scenarios. Does the code actually produce the expected behavior in each case?

OUTPUT FORMAT:
<verdict>PASS or FAIL</verdict>
<confidence>HIGH / MEDIUM / LOW</confidence>
<summary>1-3 sentence overall assessment</summary>
<goal_breakdown>
  For each sub-requirement:
  - [ACHIEVED/MISSED/PARTIAL] Requirement description
  - Evidence: specific code reference or gap
</goal_breakdown>
<constraint_compliance>
  For each constraint:
  - [ACHIEVED/MISSED] Constraint description - evidence
</constraint_compliance>
<findings>
  - [PASS/FAIL/WARN] Category: Description
  - File: path (line range if applicable)
  - Evidence: specific code or logic reference
</findings>
<blocking_issues>Issues that MUST be fixed. Empty if PASS.</blocking_issues>
""")
\`\`\`

---

### Agent 2: QA via App Execution (unspecified-high) - MAIN

This agent answers: "Does it actually work when you run it?"

The QA agent follows a structured process: brainstorm scenarios exhaustively first, then self-review and augment, then create a task list, then execute systematically.

\`\`\`
task(
  category="unspecified-high",
  run_in_background=true,
  load_skills=["playwright", "dev-browser"],
  description="QA by actually running and using the application",
  prompt="""
<review_type>QA - HANDS-ON APP EXECUTION</review_type>

<original_goal>
{GOAL}
</original_goal>

<constraints>
{CONSTRAINTS}
</constraints>

<changed_files>
{CHANGED_FILES}
</changed_files>

<run_command>
{RUN_COMMAND - how to start the application, or "unknown" if not determined}
</run_command>

You are a QA engineer. Your job is to RUN the application and verify it works through hands-on testing. You do not review code - you test behavior.

MANDATORY PROCESS (follow in order):

### Step 1: Scenario Brainstorm

Before touching the app, write down EVERY test scenario you can think of. Be exhaustive. Think about:

- **Happy paths**: The primary use cases this implementation enables. What's the main thing the user wanted to do?
- **Boundary conditions**: Empty inputs, maximum-length inputs, zero values, negative numbers, special characters, unicode, very large datasets.
- **Error paths**: Invalid inputs, network failures, missing files, permission denied, timeout conditions.
- **Regression scenarios**: Existing features that touch the same code paths. Things that worked before and must still work.
- **State transitions**: What happens when you do things out of order? Rapid repeated actions? Concurrent usage?
- **UX scenarios** (if applicable): Layout on different sizes, keyboard navigation, screen reader compatibility, loading states, error messages.
- **Integration points**: Does this feature interact with external services, databases, or other modules? Test those boundaries.

Write each scenario as a one-liner with expected behavior. Aim for 15-30 scenarios minimum.

### Step 2: Scenario Augmentation

Review your scenario list with fresh eyes. For each scenario, ask:
- "What could go wrong here that I haven't considered?"
- "What would a malicious or careless user do?"
- "What environmental conditions could affect this?" (disk full, slow network, expired tokens)

Add at least 5 more scenarios from this reflection. Group scenarios by priority: P0 (must pass), P1 (should pass), P2 (nice to pass).

### Step 3: Create Task List

Convert your augmented scenario list into a structured task list (use TaskCreate/TaskUpdate or your todo system). Each task = one test scenario with:
- Test name
- Steps to execute
- Expected result
- Priority (P0/P1/P2)

### Step 4: Execute Systematically

Work through the task list in priority order (P0 first). For each test:

1. Execute the test steps
2. Record actual result
3. Compare with expected result
4. Mark PASS or FAIL
5. If FAIL: capture evidence (screenshot, terminal output, error message)
6. Mark the task complete

**Execution guidance by app type:**
- **Web app**: Use playwright/dev-browser to navigate, click, fill forms, verify visual output.
- **CLI tool**: Run commands with various arguments, pipe inputs, check exit codes and output.
- **Library/SDK**: Write and execute a test script that imports and exercises the public API.
- **Backend API**: Use curl/httpie to hit endpoints with various payloads, verify response codes and bodies.
- **Mobile/Desktop**: If not directly runnable, write integration tests and execute them.

If the app cannot be started (build failure), that's an immediate FAIL - no need to continue.

### Step 5: Compile Results

OUTPUT FORMAT:
<verdict>PASS or FAIL</verdict>
<confidence>HIGH / MEDIUM / LOW</confidence>
<summary>1-3 sentence overall assessment</summary>
<scenario_coverage>
  Total scenarios: N
  P0: X tested, Y passed
  P1: X tested, Y passed
  P2: X tested, Y passed
</scenario_coverage>
<test_results>
  For each test:
  - [PASS/FAIL] Test name (Priority)
  - Steps: What you did
  - Expected: What should happen
  - Actual: What actually happened
  - Evidence: Screenshot path or terminal output snippet (if FAIL)
</test_results>
<blocking_issues>P0 or P1 failures only. Empty if PASS.</blocking_issues>
""")
\`\`\`

---

### Agent 3: Code Quality Review (Oracle) - MAIN

This agent answers: "Is the code well-written, maintainable, and consistent with the codebase?"

\`\`\`
task(
  subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="Review overall code quality, patterns, and architecture",
  prompt="""
<review_type>CODE QUALITY REVIEW</review_type>

<changed_files>
{CHANGED_FILES}
</changed_files>

<file_contents>
{FILE_CONTENTS - full content of changed files AND neighboring files that show existing patterns}
</file_contents>

<diff>
{DIFF}
</diff>

<background>
{BACKGROUND}
</background>

You are a senior staff engineer conducting a code review. Your standard: "Would I approve this PR without comments?"

REVIEW DIMENSIONS (examine each):

1. **Correctness**: Logic errors, off-by-one, null/undefined handling, race conditions, resource leaks, unhandled promise rejections.

2. **Pattern Consistency**: Does new code follow the codebase's established patterns? Compare with the neighboring files provided. Introducing a new pattern where one already exists = finding.

3. **Naming & Readability**: Clear variable/function/type names? Self-documenting code? Would another engineer understand this without explanation?

4. **Error Handling**: Errors properly caught, logged, and propagated? No empty catch blocks? No swallowed errors? User-facing errors are helpful?

5. **Type Safety**: Any \`as any\`, \`@ts-ignore\`, \`@ts-expect-error\`? Proper generic usage? Correct type narrowing? (If TypeScript/typed language)

6. **Performance**: N+1 queries? Unnecessary re-renders? Blocking I/O on hot paths? Memory leaks? Unbounded growth?

7. **Abstraction Level**: Right level of abstraction? No copy-paste duplication? But also no premature over-abstraction?

8. **Testing**: New behaviors covered by tests? Tests are meaningful, not just coverage padding? Test names describe scenarios?

9. **API Design**: Public interfaces clean and consistent with existing APIs? Breaking changes flagged?

10. **Tech Debt**: Does this introduce new tech debt? Or create coupling that will be painful to change?

Categorize each finding by severity:
- **CRITICAL**: Will cause bugs, data loss, or crashes in production
- **MAJOR**: Significant quality issue that should be fixed before merge
- **MINOR**: Improvement worth making but not blocking
- **NITPICK**: Style preference, optional

OUTPUT FORMAT:
<verdict>PASS or FAIL</verdict>
<confidence>HIGH / MEDIUM / LOW</confidence>
<summary>1-3 sentence overall assessment</summary>
<findings>
  - [CRITICAL/MAJOR/MINOR/NITPICK] Category: Description
  - File: path (line range)
  - Current: what the code does now
  - Suggestion: how to improve
</findings>
<blocking_issues>CRITICAL and MAJOR items only. Empty if PASS.</blocking_issues>
""")
\`\`\`

---

### Agent 4: Security Review (Oracle) - SUB

This agent answers: "Are there security vulnerabilities in these changes?"

This is supplementary - it focuses exclusively on security. It does NOT comment on code style, architecture, or functionality unless those directly create a security risk.

\`\`\`
task(
  subagent_type="oracle",
  run_in_background=true,
  load_skills=[],
  description="Security-focused review of implementation changes",
  prompt="""
<review_type>SECURITY REVIEW (supplementary)</review_type>

<changed_files>
{CHANGED_FILES}
</changed_files>

<file_contents>
{FILE_CONTENTS - full content of changed files}
</file_contents>

<diff>
{DIFF}
</diff>

You are a security engineer. Review this diff exclusively for security vulnerabilities and anti-patterns. Ignore code style, naming, architecture - unless it directly creates a security risk.

SECURITY CHECKLIST:

1. **Input Validation**: User inputs sanitized? SQL injection, XSS, command injection, SSRF vectors?
2. **Auth & AuthZ**: Authentication checks where needed? Authorization verified for each action? Privilege escalation paths?
3. **Secrets & Credentials**: Hardcoded secrets, API keys, tokens in code or config? Secrets in logs?
4. **Data Exposure**: Sensitive data in logs? PII in error messages? Over-exposed API responses?
5. **Dependencies**: New dependencies added? Known CVEs? Suspicious or unnecessary packages?
6. **Cryptography**: Proper algorithms? No custom crypto? Secure random? Proper key management?
7. **File & Path**: Path traversal? Unsafe file operations? Symlink following?
8. **Network**: CORS configured correctly? Rate limiting? TLS enforced? Certificate validation?
9. **Error Leakage**: Stack traces exposed to users? Internal details in error responses?
10. **Supply Chain**: Lockfile updated consistently? Dependency pinning?

OUTPUT FORMAT:
<verdict>PASS or FAIL</verdict>
<severity>CRITICAL / HIGH / MEDIUM / LOW / NONE</severity>
<summary>1-3 sentence overall assessment</summary>
<findings>
  - [CRITICAL/HIGH/MEDIUM/LOW] Category: Description
  - File: path (line range)
  - Risk: What could an attacker do?
  - Remediation: Specific fix
</findings>
<blocking_issues>CRITICAL and HIGH items only. Empty if PASS.</blocking_issues>
""")
\`\`\`

---

### Agent 5: Context Mining (unspecified-high) - MAIN

This agent answers: "Did we miss any context that should have informed this implementation?"

\`\`\`
task(
  category="unspecified-high",
  run_in_background=true,
  load_skills=["git-master"],
  description="Mine all accessible contexts for missed requirements or background knowledge",
  prompt="""
<review_type>CONTEXT MINING - MISSED REQUIREMENTS & BACKGROUND</review_type>

<original_goal>
{GOAL}
</original_goal>

<constraints>
{CONSTRAINTS}
</constraints>

<changed_files>
{CHANGED_FILES}
</changed_files>

<background>
{BACKGROUND}
</background>

You are an investigator. Your mission: search every accessible information source to find context that should have informed this implementation but might have been missed. The question: "Is there something we should have known but didn't?"

SOURCES TO SEARCH (use every available tool):

1. **Git History** (ALWAYS search):
   - \`git log --oneline -20 -- {each changed file}\` - recent changes and their reasons
   - \`git blame {critical sections}\` - who wrote what and when
   - \`git log --all --grep="{keywords from goal}"\` - related commits
   - Look for reverted commits, TODO/FIXME/HACK comments in history

2. **GitHub** (if \`gh\` CLI available):
   - \`gh issue list --search "{keywords}"\` - related open/closed issues
   - \`gh pr list --search "{keywords}" --state all\` - related PRs and their review comments
   - Check if any issue is specifically linked to this work
   - Look at review comments on past PRs touching these files

3. **Communication Channels** (if MCP tools available):
   - Slack: search for messages mentioning the feature, file names, or related keywords
   - Notion: search for design docs, RFCs, ADRs related to this feature
   - Discord: relevant discussions

4. **Codebase Cross-References** (ALWAYS search):
   - Files that import or reference the changed modules
   - Tests that might need updating due to behavior changes
   - Documentation (README, docs/, comments) that references changed behavior
   - Config files that might need corresponding updates
   - Related features in the same domain

WHAT TO LOOK FOR:

- Requirements mentioned in issues/PRs that the implementation misses
- Past decisions explaining WHY code was written a certain way - and whether new changes respect those reasons
- Related systems or features affected by these changes
- Warnings from previous developers (PR review comments, inline TODOs, commit messages)
- Migration or deprecation notes that affect the changed code
- Design decisions documented outside the codebase (Notion, Slack, ADRs)

OUTPUT FORMAT:
<verdict>PASS or FAIL</verdict>
<confidence>HIGH / MEDIUM / LOW</confidence>
<summary>1-3 sentence overall assessment</summary>
<sources_searched>
  - [SEARCHED/SKIPPED] Source name - what was searched (or why it wasn't accessible)
</sources_searched>
<discovered_context>
  For each discovery:
  - Source: Where found (git commit abc123, GitHub issue #42, Slack message, etc.)
  - Finding: What was found
  - Relevance: How it relates to the current work
  - Impact: [BLOCKING / IMPORTANT / FYI]
</discovered_context>
<missed_requirements>Requirements the implementation should address but doesn't. Empty if none.</missed_requirements>
<blocking_issues>BLOCKING items only. Empty if PASS.</blocking_issues>
""")
\`\`\`

---

## Phase 2: Wait & Collect

After launching all 5 agents in one turn, **end your response**. Wait for system notifications as each agent completes.

As each completes, collect via \`background_output(task_id="bg_...")\`. Store each verdict:

| Agent | Verdict | Notes |
|-------|---------|-------|
| 1. Goal Verification | pending | - |
| 2. QA Execution | pending | - |
| 3. Code Quality | pending | - |
| 4. Security | pending | - |
| 5. Context Mining | pending | - |

Do NOT deliver the final report until ALL 5 have completed.

---

## Phase 3: Deliver Verdict

<verdict_logic>

ALL 5 agents returned PASS \u2192 **REVIEW PASSED**
ANY agent returned FAIL \u2192 **REVIEW FAILED - criteria not met**

</verdict_logic>

Compile the final report in this format:

\`\`\`markdown
# Review Work - Final Report

## Overall Verdict: PASSED / FAILED

| # | Review Area | Agent Type | Verdict | Confidence |
|---|------------|------------|---------|------------|
| 1 | Goal & Constraint Verification | Oracle | PASS/FAIL | HIGH/MED/LOW |
| 2 | QA Execution | unspecified-high | PASS/FAIL | HIGH/MED/LOW |
| 3 | Code Quality | Oracle | PASS/FAIL | HIGH/MED/LOW |
| 4 | Security (supplementary) | Oracle | PASS/FAIL | Severity |
| 5 | Context Mining | unspecified-high | PASS/FAIL | HIGH/MED/LOW |

## Blocking Issues
[Aggregated from all agents - deduplicated, prioritized]

## Key Findings
[Top 5-10 most important findings across all agents, grouped by theme]

## Recommendations
[If FAILED: exactly what to fix, in priority order]
[If PASSED: non-blocking suggestions worth considering]
\`\`\`

If FAILED - be specific. The user should know exactly what to fix and in what order. No vague "consider improving X" - state the problem, the file, and the fix.

If PASSED - keep it short. Highlight any non-blocking suggestions, but don't turn a passing review into a lecture.`
};
// vendor/omo-standalone/packages/skills-core/src/skills/ai-slop-remover.ts
var aiSlopRemoverSkill = {
  name: "ai-slop-remover",
  description: "Removes AI-generated code smells from a SINGLE file while preserving functionality. For multiple files, call in PARALLEL per file.",
  template: `You are an expert code refactorer specializing in removing AI-generated "slop" patterns while STRICTLY preserving functionality.

**INPUT**: Exactly ONE file path. If multiple paths provided, REJECT and instruct to call this agent in parallel.

---

## DETECTION CRITERIA (Specific)

### 1. Obvious Comments (EXCLUDE: BDD comments like #given, #when, #then, #when/then)

**REMOVE**:
- Comments restating the code: \`x += 1  # increment x\`
- Docstrings on trivial methods: \`"""Returns the name."""\` for \`def get_name(): return self.name\`
- Section dividers: \`# ===== HELPER FUNCTIONS =====\`
- Commented-out code blocks
- \`# TODO: future enhancement\` without concrete plan
- \`# Note: this is important\` without explaining WHY

**KEEP**:
- Comments explaining WHY (business logic, edge cases, workarounds)
- Links to issues/tickets: \`# See SPR-1234\`
- Non-obvious algorithm explanations
- Regex explanations
- Matches to existing code style

### 2. Over-Defensive Code

**REMOVE**:
- Null checks for values that CANNOT be None (e.g., Django request in view)
- \`if x is not None and x.attr is not None:\` when x is guaranteed
- Try-except around code that can't raise (e.g., dict literal access)
- \`isinstance()\` checks for statically typed parameters
- Default values for required parameters: \`def foo(x: str = "")\` when empty string is invalid
- Backward-compat shims: \`_old_name = new_name  # deprecated\`
- \`# removed\` or \`# deleted\` comments for removed code
- Re-exports of unused items
- Verbose, duplicated, or redundant code / test cases

**KEEP**:
- Validation at system boundaries (user input, external API responses)
- Error handling for I/O operations
- Null checks for nullable DB fields
- assertions in test code to matching type expectations

### 3. Spaghetti Nesting (2+ levels deep)

**REFACTOR**:
- Nested if-else chains -> early returns / guard clauses
- \`if x: if y: if z:\` -> \`if not x: return\` / \`if not y: return\`
- Nested loops with conditionals -> extract to helper OR use comprehensions
- Complex ternary \`a if b else (c if d else e)\` -> explicit if-else

---

## PROCESS

### Step 1: Read & Analyze
Read the file. Identify ALL slop instances with line numbers.

### Step 2: Deep Consideration (CRITICAL)
For EACH identified issue, think:
- **Functionality Impact**: Will removing this change behavior? If ANY doubt, SKIP.
- **Test Coverage**: Are there tests that might break? If uncertain, SKIP.
- **Context Dependency**: Is this "slop" actually necessary for this specific codebase? (e.g., defensive code for known flaky external API)
- **Readability Trade-off**: Will removal make code LESS readable? If yes, SKIP.

**RULE**: When in doubt, DO NOT CHANGE. False negatives are better than breaking code.

### Step 3: Execute Changes
Make changes using Edit tool. One logical change at a time.

### Step 4: Detailed Report

**OUTPUT FORMAT**:

\`\`\`
## AI Slop Removed: {filename}

### Analysis Summary
- Total issues found: N
- Issues fixed: M
- Issues skipped (safety): K

### Changes Made

#### Change 1: [Category] Line X-Y
**Before**: [original code snippet]
**After**: [modified code snippet]
**Why this is slop**: [Explain why this pattern is problematic]
**Why safe to remove**: [Explain why functionality is preserved]
**Impact**: None - purely cosmetic improvement

---

### Skipped Issues (Preserved for Safety)

#### Skipped 1: Line X
**Reason**: [Why you chose not to change this]

### Summary
- Removed N obvious comments
- Simplified M defensive patterns
- Flattened K nested structures
- Preserved L patterns that looked like slop but serve purpose
\`\`\`

---

## SAFETY RULES

1. **NEVER remove error handling for I/O, network, or file operations**
2. **NEVER simplify validation for user input or external data**
3. **NEVER change public API signatures**
4. **NEVER remove type hints (even redundant-looking ones)**
5. **If a pattern appears in multiple places, it might be intentional - ASK before bulk removal**
6. **Preserve all BDD test comments (#given, #when, #then)**

When finished, your report should be detailed enough that a reviewer can understand EXACTLY what changed and feel confident the changes are safe.

---

## WHEN NO SLOP FOUND

If the file is clean, report:

\`\`\`
## AI Slop Analysis: {filename}

### Result: No AI Slop Detected

This file is clean. Here's why:

**Comments**: N comments found, all explain WHY not WHAT
**Defensive Code**: Null checks present are appropriate (e.g., checks external API response)
**Code Structure**: Maximum nesting depth acceptable, early returns used appropriately

**Conclusion**: This code appears to be human-written or well-reviewed AI code. No changes needed.
\`\`\``
};
// vendor/omo-standalone/packages/skills-core/src/skills/team-mode.ts
var teamModeSkill = {
  name: "team-mode",
  description: "Team orchestration \u2014 create and manage parallel agent teams (OFF by default; enable via team_mode.enabled in config). Loading this skill provides usage documentation; the team_* tools are registered globally when team_mode.enabled=true and access-gated by team role.",
  template: `# Team Mode

Team mode gives Claude Code Agent Teams parity. It is off by default. Enable it only when you want parallel multi-agent coordination, where each team member is an opencode child session.

## When to use

- Split a large job across several agents.
- Keep a lead agent focused while member agents work in parallel.
- Use worktree mode for isolated code changes, or tmux visualization when you want live session layout.

## Declare a team

Create a team at \`~/.omo/teams/{name}/config.json\`.

You can also pass the same object directly to \`team_create({ inline_spec: ... })\`.

This TeamSpec uses a lead plus members list. Every canonical member has a \`kind\` discriminator.

Example:

\`\`\`json
{
  "name": "release-squad",
  "lead": {
    "kind": "subagent_type",
    "subagent_type": "sisyphus"
  },
  "members": [
    {
      "kind": "category",
      "category": "quick",
      "prompt": "review small changes and report risks"
    },
    {
      "kind": "subagent_type",
      "subagent_type": "atlas"
    }
  ]
}
\`\`\`

Inline shorthand is accepted for category members. If \`kind\` is omitted, \`category\` implies \`kind: "category"\`. If a member uses natural planning fields like \`role\`, \`description\`, \`capabilities\`, or an unknown \`kind\`, it becomes a category worker using the current config's first enabled category. If \`kind\` is an unknown string such as a category name, that string is used as the category. \`systemPrompt\` is accepted as a \`prompt\` alias, and \`loadSkills\` is ignored because team members receive their behavior through \`prompt\`.

Example:

\`\`\`json
{
  "name": "project-analysis-team",
  "members": [
    {
      "name": "structure-analyst",
      "category": "quick",
      "systemPrompt": "Analyze directory layouts, module boundaries, and architectural organization."
    },
    {
      "name": "quality-analyst",
      "category": "quick",
      "systemPrompt": "Analyze tests, CI/CD, build scripts, conventions, and anti-patterns."
    },
    {
      "name": "Agent 3: Quality/Process Analyst",
      "role": "Quality/Process Analyst",
      "capabilities": ["tests", "builds", "CI/CD"]
    }
  ]
}
\`\`\`

## Member schema

Use \`kind: "category"\` when you want a category-backed worker. It must include both \`category\` and \`prompt\`. D-40: category members always route through \`sisyphus-junior\`.

Use \`kind: "subagent_type"\` only for eligible agents.

### Eligible subagent types

- \`sisyphus\`
- \`atlas\`
- \`sisyphus-junior\`
- \`hephaestus\`

### Hard rejects

Do not use \`oracle\`, \`prometheus\`, or other non-eligible agents here. For those, use \`delegate-task\` instead.

## Lifecycle

Teams are **ephemeral**: one team per phase of work. The moment a phase ends, or the team's shape no longer fits the next problem, **call \`team_delete\` immediately and spawn a fresh team for the next phase**. There is no in-place reshape; restructuring is delete-then-create. Lingering teams burn sessions, mailbox quota, and member-turn budget.

One cycle:

1. Lead spawns the team: \`team_create({ teamName })\` for a declared team, or \`team_create({ inline_spec })\` for a one-off. Never call \`team_create\` with empty arguments.
2. Lead assigns work with \`team_send_message\` or \`team_task_create\`.
3. Members report progress with \`team_send_message\` plus \`team_task_update\`.
4. Lead and members track progress with \`team_task_list\`, \`team_task_get\`, and \`team_status\`.
5. A member that finishes early asks to leave with \`team_shutdown_request\`; the lead handles \`team_approve_shutdown\` or \`team_reject_shutdown\`.
6. **Phase done or shape outgrown? Call \`team_delete\` now; no idle members "just in case." Loop to step 1 for the next phase.**

## Task ownership

Any agent can set or change task ownership via \`team_task_update\` with the \`owner\` field. Members typically claim work by setting \`owner: "<their-name>"\` and \`status: "claimed"\` (or directly \`"in_progress"\`). The lead can also pre-assign work by creating tasks with \`owner\` set.

## Automatic message delivery

Messages sent via \`team_send_message\` are automatically delivered to the recipient as new conversation turns \u2014 no manual inbox polling. If a recipient is mid-turn, the message is queued and injected when its turn ends, wrapped in a \`<peer_message ...>\` envelope. The UI surfaces a brief notification with the sender's name. When reporting on teammate messages, do NOT quote the original \u2014 it has already been rendered.

## Teammate idle state

Teammates go idle after every turn \u2014 this is normal and expected. A teammate going idle immediately after sending a message does NOT mean they are done or unavailable. Idle simply means they are waiting for input.

- Idle teammates can still receive messages; sending one wakes them up.
- The system emits idle notifications automatically. The lead does not need to react to every idle event \u2014 only when assigning new work or following up.
- Do not treat idle as an error. A teammate that sent a message and went idle has done its job and is awaiting reply.
- Peer DMs include a brief summary in the lead's idle notification, giving the lead visibility into peer collaboration without the full message text.

## Discovering team members

Members and the lead use \`team_status({ teamRunId })\` to see who is active, their session IDs, message backlog, and tmux pane assignments. The team config also lives at \`~/.omo/teams/{name}/config.json\` for declared teams. Always refer to teammates by their NAME (e.g., \`"lead"\`, \`"researcher"\`) \u2014 never by raw session IDs.

## Task list coordination

Members should:

1. Check \`team_task_list\` periodically, **especially after completing each task**, to find newly unblocked work.
2. Claim unassigned, unblocked tasks via \`team_task_update\` (set \`owner\` and \`status: "claimed"\` or \`"in_progress"\`). Prefer tasks in ID order (lowest first) \u2014 earlier tasks usually establish context for later ones.
3. Create new tasks via \`team_task_create\` when they identify additional work.
4. Mark tasks completed via \`team_task_update\` with \`status: "completed"\`, then re-check the task list.
5. If all available tasks are blocked, send a \`team_send_message\` to the lead to either resolve blockers or assign different work.

## Communication rules

- Do NOT send structured JSON status messages like \`{"type":"idle",...}\` or \`{"type":"task_completed",...}\`. Communicate in plain natural language.
- Do NOT use terminal tools (Bash, file readers) to inspect another teammate's session, inbox, or pane \u2014 always go through \`team_send_message\` and \`team_status\`.
- Members must NOT call \`delegate-task\` \u2014 its budget is zero inside team members. Use \`team_send_message\` to coordinate with peers instead.

## Lead-only tools

- \`team_create\` - create a team from a declaration.
- \`team_delete\` - remove a team.
- \`team_shutdown_request\` - start the shutdown flow.

## Lead or target-member shutdown tools

- \`team_approve_shutdown\` - approve shutdown for the targeted member.
- \`team_reject_shutdown\` - reject shutdown for the targeted member.

## Universal team-run tools

- \`team_send_message\` - send a direct message; broadcast is still lead-only.
- \`team_task_create\` - create a task for a member.
- \`team_task_list\` - list team tasks.
- \`team_task_update\` - update task state.
- \`team_task_get\` - inspect one task.
- \`team_status\` - show live team status.

## Global query tool

- \`team_list\` - list known teams.

## Bounds

- Max 8 members.
- Max 4 parallel workers.
- Max 32KB per message.
- Max 256KB unread inbox.

## Failure modes

- Broadcast is lead-only.
- No nested teams.
- No peer sync wait; work moves asynchronously.

## Notes

Team mode is a docs-only skill. The team_* tools are registered globally when \`team_mode.enabled=true\`.
Use \`~/.omo/teams/{name}/config.json\` plus worktree or tmux visibility to understand how the team is laid out.
`
};
// vendor/omo-standalone/packages/skills-core/src/skills.ts
function createBuiltinSkills(options = {}) {
  const { browserProvider = "playwright", disabledSkills, teamModeEnabled = false } = options;
  let browserSkill;
  if (browserProvider === "agent-browser") {
    browserSkill = agentBrowserSkill;
  } else if (browserProvider === "dev-browser") {
    browserSkill = devBrowserSkill;
  } else if (browserProvider === "playwright-cli") {
    browserSkill = playwrightCliSkill;
  } else {
    browserSkill = playwrightSkill;
  }
  const skills = [browserSkill, frontendUiUxSkill, gitMasterSkill, reviewWorkSkill, aiSlopRemoverSkill];
  if (teamModeEnabled && !disabledSkills?.has("team-mode")) {
    skills.push(teamModeSkill);
  }
  if (!disabledSkills) {
    return skills;
  }
  return skills.filter((skill) => !disabledSkills.has(skill.name));
}
export {
  createBuiltinSkills
};
