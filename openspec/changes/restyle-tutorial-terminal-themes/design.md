## Context

The public `/tutorial` route renders `TutorialLandingView.vue`, which already uses an Apple-inspired page shell with a translucent navigation bar, large centered hero copy, a segmented OS selector, and a macOS-like demo frame. The tutorial body is shared across CLI-specific Vue components and currently relies heavily on Tailwind utility classes such as `bg-gray-900`, while `global.css` applies broad tutorial overrides that label the result as an OpenAI docs style.

This creates two problems:
- Terminal commands, configuration files, and verification snippets all look like the same generic dark code block.
- Platform selection does not visually affect command examples, even though the commands differ by Windows, macOS, and Linux / WSL2.

The change is frontend-only and should preserve existing tutorial content and routes.

## Goals / Non-Goals

**Goals:**
- Keep `/tutorial` visually aligned with Apple-style presentation: clean typography, generous spacing, restrained colors, subtle glass/border/shadow treatments, and polished responsive behavior.
- Make terminal command blocks platform-aware:
  - Windows: classic PowerShell blue background with white text.
  - macOS: black background with white text.
  - Linux / WSL2: Ubuntu aubergine/purple background with white text.
- Separate semantic styling for terminal commands from neutral file/configuration code blocks.
- Improve cards, step markers, inline code chips, and overflow behavior without changing tutorial instructions.
- Avoid introducing new dependencies or backend changes.

**Non-Goals:**
- Redesigning the whole landing page, navigation architecture, or admin dashboard.
- Changing CLI installation commands, generated configuration content, API keys, or relay behavior.
- Adding syntax highlighting libraries.
- Supporting additional OS themes beyond the existing Windows, macOS, and Linux / WSL2 selector.

## Decisions

### Use platform classes from the tutorial shell

Add a platform-specific class to the tutorial demo body, for example:
- `tutorial-platform--windows`
- `tutorial-platform--macos`
- `tutorial-platform--linux`

CSS can then theme descendants without passing presentation-only props through every nested component. This keeps platform state centralized in `TutorialLandingView.vue`, where the OS selector already lives.

Alternative considered: compute all classes in each tutorial component. That would make every component duplicate theme logic and increase the chance of inconsistent terminal treatment.

### Introduce semantic command and code block classes

Use semantic classes such as:
- `tutorial-command-box` for shell/PowerShell/terminal commands.
- `tutorial-code-box` for JSON, TOML, and configuration snippets.

Existing `bg-gray-900` utility usage can be migrated or narrowly overridden so command examples are themed by platform, while config snippets remain neutral and editor-like.

Alternative considered: keep overriding `.bg-gray-900` globally. That is too broad because it cannot reliably distinguish terminal commands from file snippets.

### Keep Apple styling global but scoped to tutorial containers

Refine the tutorial-specific section of `global.css` under `.tutorial-section` and `.tutorial-content` rather than changing global application cards. Use Apple-like visual tokens: near-white page backgrounds, `#1d1d1f` body text, `#6e6e73` secondary text, `#0071e3` accents, soft borders, and low-intensity shadows.

Alternative considered: move all styling into each Vue component. That would reduce global overrides but create more repetitive CSS and make future tutorial additions harder to keep consistent.

### Preserve horizontal scrolling inside command boxes

Many commands include long URLs or environment variable assignments. Command boxes should use internal horizontal scrolling and `white-space: nowrap` for command lines, while the page itself must not overflow on mobile.

Alternative considered: wrapping commands. Wrapped shell commands can be harder to copy and may mislead users about line breaks.

## Risks / Trade-offs

- Broad tutorial CSS could unintentionally affect nested utility classes -> Keep selectors scoped to `.tutorial-section`, `.tutorial-content`, and new semantic classes.
- Some code snippets may initially be classified as command boxes or config boxes incorrectly -> Audit all tutorial components and assign semantic classes based on content.
- Windows blue and Linux aubergine themes may reduce contrast if secondary text colors remain gray -> Force command block descendants to white or near-white text.
- Maintaining Apple-like styling while preserving existing Tailwind markup can require `!important` overrides -> Limit overrides to tutorial-specific containers and prefer new semantic classes for future clarity.

## Migration Plan

1. Add platform classes in `TutorialLandingView.vue`.
2. Add/refine tutorial visual tokens and semantic block styles in `global.css`.
3. Update tutorial components so terminal commands use `tutorial-command-box` and file/config snippets use `tutorial-code-box`.
4. Verify `/tutorial` with each OS tab and CLI tool on desktop and mobile.
5. Rollback is limited to reverting frontend style/component changes if visual regressions appear.

## Open Questions

- None currently. The requested platform palette and Apple-style direction are defined.
