# @formblatt/core

Framework-agnostic core of [formblatt](https://github.com/formblatt-org/formblatt): compiles JSON form definitions into [Valibot](https://valibot.dev) schemas and evaluates everything declarative around them — conditions, expressions, visibility affects, layout resolution, definition migrations and linting.

```sh
pnpm add @formblatt/core valibot
```

## What it does

A `FormDefinition` is the wire contract: one JSON document that declares fields, validations, interaction rules and presentation. This package turns it into runnable pieces:

```ts
import {
  migrateDefinition,   // old schemaVersion → current shape
  validateDefinition,  // shape check + referential lint (throws on errors)
  buildFormSchema,     // definition → Valibot schema for the WHOLE form
  buildInitialInput,   // the declared `initial` values
  evaluate,            // conditions ({ path, op, value }, and/or/not)
  evalExpression,      // computed-value expressions (concat, arithmetic, lookup tables, dateDiff …)
  compileAffects,      // visibility rules per targeted field
  normalizeLayout,     // layout + orphans, objects flattened to dotted leaves
  lintDefinition,      // standalone lint, if you validate server-side
} from "@formblatt/core";

const definition = validateDefinition(migrateDefinition(raw));
const schema = buildFormSchema(definition); // pass { requiredMessage } to localize
```

Key semantics (each documented in detail on the types):

- **Required-when-visible** — fields targeted by visibility affects are optional in their own schema and re-required by a form-level check while visible, so a hidden required field can never block submit invisibly.
- **Linting** — `validateDefinition` rejects definitions the engine would silently mishandle: unknown validation rule types, affect targets that don't resolve or address array rows, dangling condition/expression paths, colliding `dependsOn` terminals, duplicate section/page ids, misplaced wizard pages.
- **Open validation** — `buildFormSchema` takes host-defined `rules`, a `validationResolver` for async `remote` checks (the schema goes async transparently), and an interpolated `messages` catalog for i18n.
- **Transient fields** — `transient: true` keeps a field in the form (rendered, validated, readable through the store) but strips it from the parsed values a submit delivers, so derived-for-display state never leaks into the data contract.
- **Hydration** — `buildInitialInput(definition, savedRecord)` merges host data over declared initials for edit workflows.
- **Migrations** — definitions carry a `schemaVersion`; append-only migrations bring stored documents to the current shape.

This package has no framework dependency — `valibot` is its only peer. For rendering, see [`@formblatt/vue`](https://www.npmjs.com/package/@formblatt/vue).

## License

[MIT](https://github.com/formblatt-org/formblatt/blob/main/LICENSE)
