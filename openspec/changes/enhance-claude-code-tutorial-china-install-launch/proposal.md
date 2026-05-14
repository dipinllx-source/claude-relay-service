## Why

Claude Code tutorial currently documents only the default npm installation path and a minimal `claude` startup command. Users in mainland China often need npm mirror guidance, and new users benefit from seeing the common Claude Code launch modes directly in the tutorial.

## What Changes

- Add a mainland China installation path for Claude Code using npm mirror registry guidance.
- Document both temporary mirror usage and optional persistent npm registry configuration, including how to restore the official registry.
- Add troubleshooting notes for native platform package / optional dependency installation issues that can appear when mirrors are stale or optional dependencies are disabled.
- Expand the "start using Claude Code" section with common launch modes such as interactive startup, startup with an initial prompt, one-shot print mode, continuing/resuming sessions, and environment-variable-based startup through the relay service.
- Keep changes limited to tutorial content and presentation; no backend routing, authentication, account, or relay behavior changes.

## Capabilities

### New Capabilities

- `claude-code-tutorial-guidance`: Covers the Claude Code tutorial's installation guidance, mainland China npm mirror guidance, verification steps, and common startup commands.

### Modified Capabilities

- None.

## Impact

- Affected frontend files:
  - `web/admin-spa/src/components/tutorial/ClaudeCodeTutorial.vue`
- Potentially affected validation:
  - `/tutorial` rendering for Windows, macOS, and Linux / WSL2.
  - Command copy behavior for newly added command blocks.
- No backend API changes.
- No new runtime dependencies expected.
