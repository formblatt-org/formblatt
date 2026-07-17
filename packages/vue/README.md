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

## Theming

Every color and radius in the built-in components reads a `--fb-*` custom property, with the shipped value as fallback — set the tokens on any ancestor (`:root`, a page, one form) and the whole form follows. No `:deep()` overrides needed.

```css
:root {
  --fb-color-primary: #0f766e;
  --fb-color-primary-hover: #115e59;
  --fb-radius: 6px;
}
```

| Token | Default | Used for |
| --- | --- | --- |
| `--fb-color-primary` | `#4f46e5` | buttons, focus border, spinners, active accents |
| `--fb-color-primary-hover` | `#4338ca` | primary button hover |
| `--fb-color-primary-contrast` | `#fff` | text on primary |
| `--fb-color-text` | `#1f2937` | control text, page titles |
| `--fb-color-label` | `#374151` | field labels, secondary buttons |
| `--fb-color-muted` | `#6b7280` | step indicator |
| `--fb-color-border` | `#d1d5db` | control and button borders |
| `--fb-color-border-soft` | `#e5e7eb` | section and array-row borders |
| `--fb-color-surface` | `#fff` | control and button backgrounds |
| `--fb-color-surface-soft` | `#fafafa` | section background |
| `--fb-color-surface-hover` | `#f9fafb` | secondary button hover |
| `--fb-color-disabled-text` | `#9ca3af` | disabled control text |
| `--fb-color-disabled-bg` | `#f3f4f6` | disabled control background |
| `--fb-color-error` | `#dc2626` | validation error text |
| `--fb-color-warning` | `#b45309` | the load-failed line |
| `--fb-color-error-bg` | `#fef2f2` | rejected-definition box background |
| `--fb-color-error-border` | `#fecaca` | rejected-definition box border |
| `--fb-color-error-text` | `#991b1b` | rejected-definition box text |
| `--fb-focus-ring` | `0 0 0 3px rgba(79, 70, 229, .15)` | focused control shadow |
| `--fb-radius` | `8px` | controls and buttons |
| `--fb-radius-lg` | `10px` | sections, array rows, error box |

The scoped class names (`.field`, `.field-errors`, …) are implementation detail, not API — target the tokens, not the classes.

## When things fail

- **A rejected definition renders an error state, not a crash.** Served JSON that fails migration, the shape check or the lint renders an error box (detail shown in dev builds only), fires `@error` with the reason, and exposes `definitionError`. Override the box via the `#error="{ error }"` slot.
- **Resolver failures are visible.** A field whose options load or source-mode recompute rejects shows the `loadFailed` text (its own amber line — a system problem, not a validation error) and reports through `hasOptionsError(path)` / `hasComputedError(path)` (context + slot props); a failed populate lookup sets `hasPopulateError` (slot prop / expose). Flags clear when the next attempt starts.
- **Diagnostics are routable.** Everything the engine warns or reports goes through `setDiagnosticsHandler` from `@formblatt/core` — point it at your telemetry instead of the console.

## License

[MIT](https://github.com/formblatt-org/formblatt/blob/main/LICENSE)
