# Contributing to formblatt

Thanks for helping out! This page is the five-minute version of how the repo works.

## Setup

- Node 20.19+ (or 22.x), pnpm 10+ (the exact version is pinned in `package.json`'s `packageManager`).

```sh
pnpm install
pnpm dev             # run the demo app at localhost:3000
```

## Workspace layout

| Path | What it is |
| --- | --- |
| `packages/core` | Framework-agnostic engine: definitions → Valibot schemas, conditions, expressions, layout, lint, migrations |
| `packages/vue` | Vue bindings: components, composables, the control registry |
| `apps/demo` | Nuxt demo app — every page is one scenario, also the e2e surface |

## Before you open a PR

All of these run in CI; save yourself a round trip:

```sh
pnpm lint            # eslint — new `any`s need an inline disable with a justification
pnpm typecheck       # tsc / vue-tsc / nuxi across all workspaces
pnpm test            # vitest (pnpm test:coverage enforces the coverage floor)
pnpm build:packages  # both packages must build
pnpm e2e             # playwright smoke over the demo pages (needs `playwright install chromium` once)
```

- **Tests come with the change.** Behavior fixes get a regression test; the specs read as documentation — match their style (see e.g. `packages/vue/tests/useOptions.spec.ts`).
- **Comments explain *why*, not *what*.** This repo documents behavioral contracts and edge cases on the types; keep that discipline.
- **Changesets:** a change to `packages/*` that consumers can observe needs `pnpm changeset` (pick the bump, describe the change). Demo-only and infra changes don't.
- **Commits:** small, one logical unit each, terse lowercase messages ("add affect types", not "Added new types for affects feature").
- **Formatting** is `.editorconfig` + ESLint — there is no Prettier; don't reformat code you aren't changing.

## Things to know before touching…

- **`packages/core/src/lib/definition-migrations.ts`** — append-only. Never edit a shipped migration; add a new version.
- **`packages/vue/src/form-store.ts`** — the ONLY module that talks to `@formisch/vue` directly. New formisch calls go here, nowhere else (formisch is an exactly-pinned RC; this seam absorbs its changes).
- **`packages/vue/src/controls/`** — a new built-in control is a component implementing `BuiltInControlProps` plus a registry entry. The scaffold in `DynamicInput.vue` should not need changes.
- **Styling** — every color/radius must read a `--fb-*` token with a fallback (see the theming table in `packages/vue/README.md`). No new raw hex values in components.

## Reporting bugs / requesting features

Use the issue templates. For bugs, a failing definition (JSON) plus expected/actual behavior is the fastest path to a fix — the [playground page](apps/demo/app/pages/playground.vue) of the demo is great for producing one.
