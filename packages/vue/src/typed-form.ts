import DynamicForm from "./components/DynamicForm.vue";
import DynamicLayout from "./components/DynamicLayout.vue";
import DynamicSection from "./components/DynamicSection.vue";
import DynamicField from "./components/DynamicField.vue";
import DynamicFieldArray from "./components/DynamicFieldArray.vue";
import type { FormDefinition, PathKey } from "@formblatt/core";

// ---- name extraction from a literal-typed definition ----

type TopLevelField<T extends FormDefinition> = T["fields"][number];

/** Names of top-level fields DynamicField can render (not object/array). */
export type ValueFieldNames<T extends FormDefinition> =
  Exclude<TopLevelField<T>, { kind: "object" | "array" }>["name"];

/** Names of top-level array fields for DynamicFieldArray. */
export type ArrayFieldNames<T extends FormDefinition> =
  Extract<TopLevelField<T>, { kind: "array" }>["name"];

type NodeSectionIds<N> = N extends { type: "section"; id: infer I extends string; children: infer C extends readonly unknown[] }
  ? I | NodeSectionIds<C[number]>
  : never;

/** Ids of sections (at any depth) declared in the definition's layout. */
export type SectionIds<T extends FormDefinition> = NodeSectionIds<NonNullable<T["layout"]>[number]>;

// ---- component re-typing (type-level only, zero runtime cost) ----

/**
 * Narrows a component's $props by intersection while keeping slots, exposed
 * and emits. Intersecting `string` props with literal unions collapses them
 * to the union — which is what drives the autocomplete.
 */
type WithProps<C, TProps> = C & (new (...args: any[]) => { $props: TProps });

/** Preserves a definition literal's names in its type for the typed components. Identity at runtime. */
export function defineFormDefinition<const T extends FormDefinition>(definition: T): T {
  return definition;
}

/**
 * The dynamic-form components re-typed against one definition: `name` / `id`
 * props become unions of its actual field names and section ids, so they
 * autocomplete and typos fail typecheck. Purely type-level — the returned
 * values ARE the regular components. Only works for definitions authored in
 * source; backend-served ones can't be typed this way.
 */
export function createTypedForm<const T extends FormDefinition>(definition: T) {
  return {
    definition,
    DynamicForm,
    DynamicLayout,
    DynamicSection: DynamicSection as WithProps<typeof DynamicSection, { id: SectionIds<T> }>,
    DynamicField: DynamicField as WithProps<typeof DynamicField, { name?: ValueFieldNames<T>; path?: PathKey[] }>,
    DynamicFieldArray: DynamicFieldArray as WithProps<typeof DynamicFieldArray, { name: ArrayFieldNames<T> }>,
  };
}
