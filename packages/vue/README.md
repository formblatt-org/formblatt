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

- **`DynamicForm`** — owns the store and provides context. Props: `definition`, optional `resolvePopulate` / `resolveOptions` / `resolveComputed` host resolvers (a warning tells you when a definition needs one), `errorDisplay: "always" | "touched"`, and `text` to override every built-in UI string (the i18n hook).
- **`DynamicField`** — one control, by top-level `name` or any `path` (e.g. `["address", "city"]`).
- **`DynamicFieldArray`** — rows with add/remove/move/swap, headless via its slot.
- **`createTypedForm(definition)`** — the same components re-typed against a literal definition, so `name` props autocomplete and typos fail typecheck.
- **Composables** — `useAffects`, `usePopulate`, `useOptions`, `useComputed` for building your own components over the same engine.

Interaction rules come from the definition: visibility affects (`show` / `hide` / `hideAndClear`), `populate` lookups that write many fields and revert cleanly, cascading dynamic options (country → state), and computed fields — synchronous expressions or async host-resolved sources, per-row inside arrays. Submit is gated while any of that is in flight, and a failed submit focuses the first invalid control.

## License

[MIT](https://github.com/formblatt-org/formblatt/blob/main/LICENSE)
