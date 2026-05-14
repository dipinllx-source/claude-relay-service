## ADDED Requirements

### Requirement: Mainland China Claude Code installation guidance
The Claude Code tutorial SHALL provide a clearly labeled mainland China network environment installation option that uses npm mirror registry guidance without replacing the default official npm install path.

#### Scenario: User installs through a temporary mirror
- **WHEN** the user views the Claude Code installation step
- **THEN** the tutorial shows a mainland China option using `npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com`

#### Scenario: User configures a persistent npm mirror
- **WHEN** the user views the mainland China installation guidance
- **THEN** the tutorial shows optional persistent npm registry commands for setting `https://registry.npmmirror.com`, installing Claude Code, and restoring `https://registry.npmjs.org/`

### Requirement: Native package troubleshooting guidance
The Claude Code tutorial SHALL include concise troubleshooting guidance for native platform package or optional dependency installation failures that can occur when npm mirrors are stale or optional dependencies are disabled.

#### Scenario: Native package is missing from the selected registry
- **WHEN** the user reads installation troubleshooting guidance
- **THEN** the tutorial explains that users should verify optional dependencies are enabled and that the selected registry has synchronized the required Claude Code platform package

### Requirement: Claude Code common startup commands
The Claude Code tutorial SHALL document common Claude Code startup modes in addition to the basic interactive `claude` command.

#### Scenario: User reviews common startup modes
- **WHEN** the user views the "start using Claude Code" step
- **THEN** the tutorial shows examples for interactive startup, startup with an initial prompt, one-shot print mode with `claude -p`, continuing the latest session with `claude -c`, resuming a session with `claude -r`, and diagnostics with `claude doctor`

### Requirement: Relay-aware Claude Code startup guidance
The Claude Code tutorial SHALL show how to start Claude Code with the relay service environment variables in a platform-appropriate way.

#### Scenario: User starts Claude Code through the relay service on Windows
- **WHEN** the selected tutorial platform is Windows
- **THEN** the tutorial shows PowerShell commands that set `ANTHROPIC_BASE_URL` to the current tutorial base URL, set `ANTHROPIC_AUTH_TOKEN` to the user's API key placeholder, and run `claude`

#### Scenario: User starts Claude Code through the relay service on macOS or Linux
- **WHEN** the selected tutorial platform is macOS or Linux / WSL2
- **THEN** the tutorial shows shell commands that set `ANTHROPIC_BASE_URL` to the current tutorial base URL, set `ANTHROPIC_AUTH_TOKEN` to the user's API key placeholder, and run `claude`

### Requirement: Tutorial command block behavior
New Claude Code installation and startup command examples SHALL use the existing tutorial command block semantics so platform terminal themes, horizontal scrolling, and copy behavior remain consistent.

#### Scenario: User copies a new command example
- **WHEN** the user views a newly added Claude Code installation or startup command block
- **THEN** the command block uses the tutorial command styling and remains compatible with the existing command copy enhancement
