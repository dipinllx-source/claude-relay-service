## Context

The Claude Code tutorial is rendered by `web/admin-spa/src/components/tutorial/ClaudeCodeTutorial.vue` under the shared `/tutorial` flow. It currently covers Node.js installation, a single npm official-registry install command, relay environment variables, and a minimal startup path with `claude`.

This leaves two usability gaps:
- Mainland China users may hit slow or unreliable npm registry access and need a clear mirror-based install path.
- New Claude Code users do not see common launch modes such as one-shot print mode, continuing sessions, resuming sessions, or quick diagnostics.

The tutorial already has semantic `tutorial-command-box` and `tutorial-code-box` styles plus copy-button enhancement for command blocks. The change should reuse these patterns rather than introducing new UI primitives.

## Goals / Non-Goals

**Goals:**

- Add mainland China npm mirror installation guidance for Claude Code.
- Keep the default install path visible while making mirror usage an explicit alternative.
- Add common Claude Code startup examples for interactive, prompt-based, one-shot, session continuation, session resume, and diagnostic usage.
- Add relay-aware startup examples using `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` with platform-specific syntax.
- Preserve readable platform-specific rendering and command copy behavior across Windows, macOS, and Linux / WSL2.

**Non-Goals:**

- Do not change relay routing, authentication, account handling, model mapping, or backend behavior.
- Do not add package manager abstractions beyond npm registry guidance.
- Do not add runtime dependencies or new tutorial routes.
- Do not change Codex, Gemini CLI, Droid CLI, or Node.js tutorial behavior except where shared styling already applies.

## Decisions

### Keep official npm install as the primary path and add mainland China as an alternative

The tutorial should continue to present the standard `npm install -g @anthropic-ai/claude-code` path first, then add a clearly labeled "中国大陆网络环境" section. This keeps the default path simple while giving affected users a practical alternative.

Alternative considered: Replace the default install command with a mirror command. Rejected because users outside mainland China should not be directed to a third-party registry by default.

### Prefer temporary mirror usage before persistent npm registry changes

The mainland China section should recommend one-off mirror usage first:

```bash
npm install -g @anthropic-ai/claude-code --registry=https://registry.npmmirror.com
```

Persistent registry configuration can be documented as an optional method, along with restoring the official registry:

```bash
npm config set registry https://registry.npmmirror.com
npm install -g @anthropic-ai/claude-code
npm config set registry https://registry.npmjs.org/
```

Alternative considered: Only document `npm config set registry`. Rejected because it silently changes future npm behavior for the user.

### Add targeted native package troubleshooting

Claude Code installs platform-specific native packages through npm. The tutorial should mention that if a native package cannot be found, users should check that optional dependencies are enabled and that the selected mirror has synchronized the needed platform package.

Alternative considered: Add a long troubleshooting matrix. Rejected because the tutorial should remain concise; deeper diagnosis belongs in a troubleshooting entry.

### Expand startup examples without overloading the first-run path

The first command should remain the simple interactive startup:

```bash
claude
```

Additional examples should be grouped as "常用启动方式" so users can scan:
- `claude "..."` for launching with an initial prompt.
- `claude -p "..."` for one-shot print mode / quick verification.
- `claude -c` for continuing the most recent session in the current directory.
- `claude -r "<session>" "..."` for resuming a named or selected session.
- `claude doctor` for diagnostics.

Alternative considered: Put every CLI mode into separate full tutorial steps. Rejected because this change is a concise tutorial supplement, not a full CLI reference.

### Use existing tutorial command/code semantics

All shell and PowerShell snippets should use `tutorial-command-box` so platform terminal styling and copy behavior continue to work. Explanatory output examples or JSON/config content should remain in `tutorial-code-box`.

Alternative considered: Add bespoke cards and copy logic for this section. Rejected because it duplicates existing tutorial behavior and increases visual inconsistency.

## Risks / Trade-offs

- Mirror command becomes stale or mirror sync lags → Label mirror usage as an alternative and preserve the official registry command.
- Persistent registry changes surprise users later → Show the temporary `--registry` method first and include the restore command for official npm.
- Too many startup commands overwhelm beginners → Keep `claude` as the primary startup command and group advanced examples under a compact common-usage section.
- Long commands overflow on mobile → Use existing `tutorial-command-box` internal scrolling and keep command lines copyable.
- Platform syntax differences cause incorrect examples → Keep Windows PowerShell examples separate from macOS/Linux shell examples.

## Migration Plan

1. Update `ClaudeCodeTutorial.vue` installation step with the mainland China install card and troubleshooting notes.
2. Update the startup step with common launch-mode examples and relay-aware startup snippets.
3. Verify the tutorial renders for Windows, macOS, and Linux / WSL2 without page-level horizontal overflow.
4. Verify command copy buttons appear on new command boxes and copy the intended commands.
5. Roll back by reverting the tutorial component changes if the added guidance causes rendering or copy regressions.

## Open Questions

- None currently; the requested scope is limited to Claude Code tutorial content.
