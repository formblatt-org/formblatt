import DynamicForm from "./components/DynamicForm.vue";
import DynamicLayout from "./components/DynamicLayout.vue";
import DynamicSection from "./components/DynamicSection.vue";
import DynamicField from "./components/DynamicField.vue";
import DynamicFieldArray from "./components/DynamicFieldArray.vue";
import type { Computed, FieldDefinition, FormDefinition, Option, PathKey } from "@formblatt/core";
import type { SubmitContext } from "./form-context";

// ---- name extraction from a literal-typed definition ----

type TopLevelField<T extends FormDefinition> = T["fields"][number];

/** Names of top-level fields DynamicField can render (not object/array). */
export type ValueFieldNames<T extends FormDefinition> =
  Exclude<TopLevelField<T>, { kind: "object" | "array" }>["name"];

/** Names of top-level array fields for DynamicFieldArray. */
export type ArrayFieldNames<T extends FormDefinition> =
  Extract<TopLevelField<T>, { kind: "array" }>["name"];

type NodeSectionIds<N> =
  N extends { type: "section"; id: infer I extends string; children: infer C extends readonly unknown[] }
    ? I | NodeSectionIds<C[number]>
    : N extends { type: "page"; children: infer C extends readonly unknown[] }
      ? NodeSectionIds<C[number]>
      : never;

/** Ids of sections (at any depth, pages included) declared in the definition's layout. */
export type SectionIds<T extends FormDefinition> = NodeSectionIds<NonNullable<T["layout"]>[number]>;

/** Ids of the wizard pages declared in the definition's layout. */
export type PageIds<T extends FormDefinition> =
  Extract<NonNullable<T["layout"]>[number], { type: "page" }>["id"];

// ---- output inference from a literal-typed definition ----

type Prettify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Top-level names a visibility affect targets — hidden fields submit as
 * `undefined`, so they type as optional. Nested (multi-segment) targets are
 * not narrowed; their leaf keeps its base type.
 */
type AffectTargetNames<T extends FormDefinition> =
  NonNullable<T["affects"]>[number] extends infer A
    ? A extends { effect: "show" | "hide" | "hideAndClear"; targets: infer TS extends readonly (readonly PathKey[])[] }
      ? TS[number] extends infer P
        ? P extends readonly [infer N extends string] ? N : never
        : never
      : never
    : never;

/** Optional in the submitted data: declared optional, never user-fillable, or visibility-controlled. */
type IsOptionalField<F, C extends string> =
  F extends { required: false } | { hidden: true } | { disabled: true } | { computed: Computed }
    ? true
    : F extends { name: C } ? true : false;

/** One enum choice: a static enum narrows to its option values, a dynamic one is any string. */
type EnumOutput<F> = F extends { options: infer O extends readonly Option[] } ? O[number]["value"] : string;

/** The value one field submits. A `multiple` enum submits a LIST of its choices. */
type FieldOutput<F> =
  | (F extends { kind: "enum"; multiple: true } ? EnumOutput<F>[]
    : F extends { kind: "enum" } ? EnumOutput<F>
    : F extends { kind: "string" | "date" } ? string
    : F extends { kind: "number" } ? number
    : F extends { kind: "boolean" } ? boolean
    : F extends { kind: "object"; fields: infer FS extends readonly FieldDefinition[] } ? FieldsOutput<FS, never>
    : F extends { kind: "array"; item: infer I extends FieldDefinition } ? FieldOutput<I>[]
    : unknown)
  | (F extends { nullable: true } ? null : never);

/** Transient fields are stripped from the parsed values, so they never reach the payload type. */
type SubmittedFields<FS extends readonly FieldDefinition[]> = Exclude<FS[number], { transient: true }>;

type FieldsOutput<FS extends readonly FieldDefinition[], C extends string> = Prettify<
  { [F in SubmittedFields<FS> as IsOptionalField<F, C> extends true ? never : F["name"]]: FieldOutput<F> } &
  { [F in SubmittedFields<FS> as IsOptionalField<F, C> extends true ? F["name"] : never]?: FieldOutput<F> }
>;

/**
 * The submitted data shape of a literal-typed definition: required fields are
 * present, optional / computed / visibility-controlled ones may be absent,
 * static enums narrow to their option values. An approximation by design —
 * the runtime contract is the built Valibot schema.
 */
export type InferFormOutput<T extends FormDefinition> =
  FieldsOutput<T["fields"], AffectTargetNames<T>>;

// ---- component re-typing (type-level only, zero runtime cost) ----

/**
 * Narrows a component's $props by intersection while keeping slots, exposed
 * and emits. Intersecting `string` props with literal unions collapses them
 * to the union — which is what drives the autocomplete.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- constructor args of a component type are opaque here
type WithProps<C, TProps> = C & (new (...args: any[]) => { $props: TProps });

/**
 * REPLACES $props keys instead of intersecting them. Intersection is right
 * for narrowing `string` to a literal union, but wrong for a function prop:
 * a handler intersected with a narrower signature demands BOTH signatures
 * from the value assigned to it, which no single function satisfies. The
 * rebuilt constructor keeps slots, emits and exposed members.
 */
type WithReplacedProps<C, TProps> =
  C extends new (...args: infer A) => infer I
    ? I extends { $props: infer P }
      ? new (...args: A) => Omit<I, "$props"> & { $props: Omit<P, keyof TProps> & TProps }
      : C
    : C;

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
    DynamicForm: DynamicForm as WithReplacedProps<typeof DynamicForm, {
      onSubmit?: (values: InferFormOutput<T>, context: SubmitContext) => unknown | Promise<unknown>;
    }>,
    DynamicLayout,
    DynamicSection: DynamicSection as WithProps<typeof DynamicSection, { id: SectionIds<T> }>,
    DynamicField: DynamicField as WithProps<typeof DynamicField, { name?: ValueFieldNames<T>; path?: PathKey[] }>,
    DynamicFieldArray: DynamicFieldArray as WithProps<typeof DynamicFieldArray, { name: ArrayFieldNames<T> }>,
  };
}
