# @formblatt/vue

Vue 3 bindings for [formblatt](https://github.com/formblatt-org/formblatt): headless components and composables that render a JSON `FormDefinition` on top of [`@formisch/vue`](https://formisch.dev).

```sh
pnpm add @formblatt/vue @formblatt/core @formisch/vue valibot
```

## Quick start

```vue
<script setup lang="ts">
import { DynamicForm } from "@formblatt/vue";
import "@formblatt/vue/style.css";

const definition = {
  id: "signup-v1",
  fields: [
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    { name: "terms", kind: "boolean", control: "checkbox", label: "Accept the terms", validations: [{ type: "isTrue", message: "You must accept the terms" }] },
  ],
};
</script>

<template>
  <DynamicForm :definition="definition" @submit="values => console.log(values)" />
</template>
```

`DynamicForm` validates the definition, builds the store and renders every field through the automatic layout — or open its default slot and place `DynamicLayout`, `DynamicSection`, `DynamicField` and `DynamicFieldArray` yourself. In dev mode the form warns when a field is validated but never placed in the DOM.

## The moving parts

- **`DynamicForm`** — owns the store and provides context. Props: `definition`, `initialData` (hydrate an edit workflow's saved record over the declared initials), host resolvers `resolvePopulate` / `resolveOptions` / `resolveComputed` / `resolveValidation` (each optional — a warning tells you when a definition needs one), `rules` (host-defined validation rules), `controls` (host-registered input components), `messages` (validation message catalog with `{field}` / `{value}` interpolation), `text` (every built-in UI string — the i18n hook), and `errorDisplay: "always" | "touched"`.
- **Submit** — `@submit` receives the parsed values and a context; async handlers keep the form `isSubmitting` until they settle, and `context.setFieldErrors({ "email": "Taken" })` maps server-side errors back onto fields. `createTypedForm` types the payload from a literal definition.
- **`DynamicField`** — one control, by top-level `name` or any `path` (e.g. `["address", "city"]`).
- **`DynamicFieldArray`** — rows with add/remove/move/swap, headless via its slot.
- **Wizard** — `page` nodes in the layout turn the form into a multi-step wizard: one step at a time, Next gated on the current page's validation, `visibleWhen` skips steps, submit on the last page.
- **`createTypedForm(definition)`** — the same components re-typed against a literal definition, so `name` props autocomplete, typos fail typecheck and the submit payload is inferred.
- **Composables** — `useAffects`, `usePopulate`, `useOptions`, `useComputed`, `usePages` for building your own components over the same engine.

Interaction rules come from the definition: visibility affects (`show` / `hide` / `hideAndClear`), `populate` lookups that write many fields and revert cleanly, cascading dynamic options (country → state), and computed fields — synchronous expressions or async host-resolved sources, per-row inside arrays. Submit is gated while any of that is in flight, a failed submit focuses the first invalid control, and `is-dirty` (slot prop / expose) drives unsaved-changes guards.

## License

[MIT](https://github.com/formblatt-org/formblatt/blob/main/LICENSE)
