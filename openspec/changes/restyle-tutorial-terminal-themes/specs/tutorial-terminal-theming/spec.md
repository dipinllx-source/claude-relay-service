## ADDED Requirements

### Requirement: Apple-style tutorial presentation
The tutorial page SHALL present installation and setup content with an Apple-aligned visual style, including clean typography, generous spacing, restrained color usage, subtle borders, soft shadows, and polished card treatments scoped to tutorial content.

#### Scenario: Tutorial page renders with cohesive Apple-style content
- **WHEN** a user opens `/tutorial`
- **THEN** the tutorial shell and tutorial body use a cohesive Apple-style visual treatment without switching to a separate documentation aesthetic

#### Scenario: Tutorial cards remain readable
- **WHEN** tutorial step cards, notes, warnings, and tips are displayed
- **THEN** they use subtle backgrounds, borders, and spacing that preserve readable hierarchy without saturated or clashing colors

### Requirement: Platform-specific terminal command themes
The tutorial page SHALL theme terminal command boxes according to the selected operating system.

#### Scenario: Windows terminal command theme
- **WHEN** the selected tutorial platform is Windows
- **THEN** terminal command boxes use a classic PowerShell blue background with white command text

#### Scenario: macOS terminal command theme
- **WHEN** the selected tutorial platform is macOS
- **THEN** terminal command boxes use a black background with white command text

#### Scenario: Linux terminal command theme
- **WHEN** the selected tutorial platform is Linux / WSL2
- **THEN** terminal command boxes use an Ubuntu-style aubergine purple background with white command text

### Requirement: Semantic separation of command and configuration blocks
The tutorial page SHALL visually distinguish terminal command examples from file and configuration snippets.

#### Scenario: Command examples use terminal themes
- **WHEN** a block contains a shell, PowerShell, installation, verification, or environment command
- **THEN** the block uses the platform-specific terminal command theme

#### Scenario: Configuration snippets use neutral code styling
- **WHEN** a block contains JSON, TOML, or other file configuration content
- **THEN** the block uses a neutral editor-style code treatment instead of a platform terminal theme

### Requirement: Responsive command and code block behavior
The tutorial page SHALL keep command and code examples usable on small screens without causing page-level horizontal overflow.

#### Scenario: Long command on mobile
- **WHEN** a command line is wider than the mobile viewport
- **THEN** the command box scrolls horizontally within its own bounds and the page layout remains within the viewport

#### Scenario: Code block on desktop
- **WHEN** a user views tutorial command or configuration blocks on a desktop viewport
- **THEN** text remains legible with consistent monospace typography, padding, border radius, and contrast

### Requirement: Existing tutorial behavior remains unchanged
The tutorial style update SHALL NOT change tutorial routes, OS selection behavior, CLI tool selection behavior, command content, configuration content, or backend APIs.

#### Scenario: User switches OS
- **WHEN** a user switches between Windows, macOS, and Linux / WSL2 in the tutorial
- **THEN** the current tutorial component remains selected and only platform-specific tutorial content and terminal theming update

#### Scenario: User switches CLI tool
- **WHEN** a user switches between Claude Code, Codex, Gemini CLI, and Droid CLI
- **THEN** the selected tutorial content renders normally with the active platform theme applied
