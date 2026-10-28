# Project instructions

## Formatting

- Always run `npm run format` after updating code in this project and before completing the task.
- Run `npm run format:check` to verify formatting before handing off changes.
- Use the existing `.prettierrc.json` and `.prettierignore` configuration.
- Always use braces for control-flow bodies, including single-line `if` statements (`curly: all` in Oxlint).
- Leave a blank line after the import block and before a JSX return following hooks or other logic.
- `npm run format` applies Oxlint fixes and the spacing rules before Prettier; `npm run format:check` verifies all three. Prettier itself does not offer these brace or blank-line rules.

## Component structure

- Keep components focused on rendering, translation hooks, queries, and feature hooks.
- Put feature-owned components and their styles in `src/features/<feature>/components`, alongside that feature’s `hooks`, `utils`, and `constants` directories. Keep only UI shared across unrelated features in `src/components/common`.
- Put feature constants in `src/features/<feature>/constants/<feature>.constants.ts`; create feature directories only when they have content.
- Put substantial state, effects, memoization, and interaction handlers in `src/features/<feature>/hooks`. Small, obvious cases may stay in components.
- Put pure feature functions in `src/features/<feature>/utils`; put utilities shared across unrelated features in `src/utils` and shared hooks in `src/hooks`.
- Keep JSX renderers as components, rather than utilities that return JSX.
- Keep named types in `src/types/<feature>` and mock fixtures in `src/api/<feature>/mocks`.
- Avoid nested or chained ternaries. Use named mappings, explicit branches, or separate components.

- Keep conditional returns small. Extract substantial JSX branches into named subcomponents declared below the main component in the same file, then return `<Subcomponent />` from the condition. Small fallback elements can stay inline.
