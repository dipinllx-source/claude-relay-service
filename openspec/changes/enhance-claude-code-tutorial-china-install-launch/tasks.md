## 1. Installation Guidance

- [x] 1.1 Update `ClaudeCodeTutorial.vue` to keep the default Claude Code npm install path visible and add a clearly labeled mainland China installation option.
- [x] 1.2 Add a temporary mirror install command using `--registry=https://registry.npmmirror.com`.
- [x] 1.3 Add optional persistent npm registry commands for setting npmmirror, installing Claude Code, and restoring the official npm registry.
- [x] 1.4 Add concise native platform package / optional dependency troubleshooting notes for mirror sync or optional dependency failures.

## 2. Startup Guidance

- [x] 2.1 Expand the startup section with common Claude Code launch examples: interactive `claude`, initial prompt, `claude -p`, `claude -c`, `claude -r`, and `claude doctor`.
- [x] 2.2 Add relay-aware temporary startup examples using `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` with Windows PowerShell syntax.
- [x] 2.3 Add relay-aware temporary startup examples using `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` with macOS/Linux shell syntax.
- [x] 2.4 Ensure all new shell and PowerShell examples use `tutorial-command-box` and any non-command output/config snippets use `tutorial-code-box`.

## 3. Validation

- [x] 3.1 Verify `/tutorial` renders the updated Claude Code guide for Windows, macOS, and Linux / WSL2.
- [x] 3.2 Verify long commands scroll inside command boxes without page-level horizontal overflow on mobile.
- [x] 3.3 Verify copy buttons appear on newly added command boxes and copy the intended command text.
- [x] 3.4 Run the frontend lint/build or the closest available validation command and fix tutorial-related regressions.

## 4. Deployment Verification

- [x] 4.1 Redeploy the updated frontend, restart the service, and verify the running `/tutorial` page shows the updated Claude Code installation and startup guidance.
