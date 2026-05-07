## Why

The tutorial page already uses an Apple-inspired landing shell, but the tutorial body still feels inconsistent and command blocks use a generic dark code style. Platform-specific terminal styling will make the guide clearer, more polished, and easier for users to visually map to their operating system.

## What Changes

- Align tutorial content styling with the existing Apple-style `/tutorial` page: restrained palette, generous spacing, subtle borders, soft shadows, and typography consistent with the landing page.
- Introduce platform-aware terminal command boxes:
  - Windows uses classic PowerShell blue background with white text.
  - macOS uses black background with white text.
  - Linux / WSL2 uses Ubuntu-style aubergine purple background with white text.
- Separate terminal command blocks from file/configuration code blocks so JSON, TOML, and config snippets remain readable in a neutral editor-style treatment.
- Improve related tutorial cards, inline code chips, step markers, spacing, and mobile overflow behavior for a cohesive and attractive experience.
- No breaking changes to routes, APIs, authentication, or tutorial content semantics.

## Capabilities

### New Capabilities

- `tutorial-terminal-theming`: Defines the visual behavior for tutorial pages, including Apple-style tutorial presentation and platform-specific terminal command themes.

### Modified Capabilities

- None.

## Impact

- Affected frontend files:
  - `web/admin-spa/src/views/TutorialLandingView.vue`
  - `web/admin-spa/src/assets/styles/global.css`
  - `web/admin-spa/src/components/tutorial/*.vue`
- No backend API changes.
- No new runtime dependencies expected.
- Validation should focus on `/tutorial` desktop/mobile rendering and Windows, macOS, Linux / WSL2 platform switching.
