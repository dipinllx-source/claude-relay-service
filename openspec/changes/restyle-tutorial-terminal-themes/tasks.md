## 1. Theme Foundation

- [x] 1.1 Add active platform theme classes to the `/tutorial` demo body in `TutorialLandingView.vue`.
- [x] 1.2 Refine tutorial-scoped Apple-style tokens in `global.css` for typography, spacing, cards, step markers, inline code, borders, and shadows.
- [x] 1.3 Add semantic styles for `tutorial-command-box` and `tutorial-code-box`.
- [x] 1.4 Add platform-specific terminal styles for Windows PowerShell blue, macOS black, and Linux / WSL2 Ubuntu aubergine themes.

## 2. Tutorial Component Updates

- [x] 2.1 Update `NodeInstallTutorial.vue` so installation and verification commands use terminal command styling.
- [x] 2.2 Update `VerifyInstall.vue` so Node/npm verification commands use terminal command styling.
- [x] 2.3 Update `ClaudeCodeTutorial.vue` so shell/PowerShell commands use terminal styling and JSON/config snippets use neutral code styling.
- [x] 2.4 Update `GeminiCliTutorial.vue` so environment and verification commands use terminal command styling.
- [x] 2.5 Update `CodexTutorial.vue` so TOML/JSON snippets use neutral code styling and write commands use terminal command styling.
- [x] 2.6 Update `DroidCliTutorial.vue` so JSON configuration snippets use neutral code styling.

## 3. Responsive And Regression Checks

- [x] 3.1 Verify long commands scroll inside command boxes without page-level horizontal overflow on mobile.
- [x] 3.2 Verify Windows, macOS, and Linux / WSL2 OS switching updates terminal themes while preserving selected CLI tool behavior.
- [x] 3.3 Verify Claude Code, Codex, Gemini CLI, and Droid CLI tutorials render with readable command/config blocks.
- [x] 3.4 Run the frontend lint/build or the closest available project validation command and fix any style-related regressions.
