## What & why

<!-- What does this change, and what problem does it solve? Link the issue if there is one. -->

## Checklist

- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass locally
- [ ] Behavior changes come with a test
- [ ] Observable changes to `@formblatt/*` have a changeset (`pnpm changeset`)
- [ ] No new raw hex colors in components (use `--fb-*` tokens) and no new direct `@formisch/vue` calls outside `form-store.ts`
