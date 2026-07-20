import type { FieldDefinition, FormDefinition, PathKey, ValueField } from "../types";

/**
 * Resolves a runtime path to its field definition, or `undefined` when the
 * path addresses none. A numeric segment indexes an array field and descends
 * into its `item`, so `["lines", 0, "qty"]` resolves through lines → item →
 * qty — the index itself is never checked, since every row shares one schema.
 */
export function resolveFieldByPath(
  definition: FormDefinition,
  path: readonly PathKey[],
): FieldDefinition | undefined {
  let field: FieldDefinition | undefined;
  let siblings: readonly FieldDefinition[] = definition.fields;

  for (const key of path) {
    if (typeof key === "number") {
      if (field?.kind !== "array") return undefined;
      field = field.item;
    } else {
      field = siblings.find(candidate => candidate.name === key);
      if (!field) return undefined;
    }

    if (field.kind === "object") siblings = field.fields;
  }

  return field;
}

/** Narrows to a leaf field an input control can render (not object/array). */
export function isValueField(field: FieldDefinition): field is ValueField {
  return field.kind !== "object" && field.kind !== "array";
}

/**
 * The registry key a field's control resolves to. The renderer is headless —
 * every field renders a host-registered control, addressed by this key: an
 * explicit `control` always wins; a `multiple` enum without one resolves to
 * the reserved key `"multiple"`; everything else defaults to `"text"`.
 */
export function controlKeyFor(field: ValueField): string {
  return field.control ?? (field.multiple ? "multiple" : "text");
}

/** One leaf value field with its data path — what {@link walkValueFields} yields. */
export interface ValueFieldEntry {
  field: ValueField;
  /** Path from the walk root, one segment per object level. */
  path: string[];
}

/**
 * Every leaf value field reachable through object nesting, depth-first in
 * declaration order. Arrays are boundaries — their rows are a separate,
 * per-row concern (`DynamicFieldArray`, row-relative computed) and are never
 * descended into.
 */
export function walkValueFields(
  fields: readonly FieldDefinition[],
  base: readonly string[] = [],
): ValueFieldEntry[] {
  const entries: ValueFieldEntry[] = [];

  for (const field of fields) {
    const path = [...base, field.name];
    if (field.kind === "object") entries.push(...walkValueFields(field.fields, path));
    else if (field.kind !== "array") entries.push({ field, path });
  }

  return entries;
}

/**
 * Resolves a name path through OBJECT nesting only — `["address", "city"]` —
 * as layout references and coverage tracking address fields. Arrays are
 * boundaries: anything below an array resolves to `undefined`.
 */
export function resolveFieldByNamePath(
  fields: readonly FieldDefinition[],
  segments: readonly string[],
): FieldDefinition | undefined {
  let siblings = fields;
  let field: FieldDefinition | undefined;

  for (const segment of segments) {
    field = siblings.find(candidate => candidate.name === segment);
    if (!field) return undefined;
    siblings = field.kind === "object" ? field.fields : [];
  }

  return field;
}

/** A {@link ValueField} whose value is derived rather than typed by the user. */
export type ComputedField = ValueField & { computed: NonNullable<ValueField["computed"]> };

/** Narrows a field to one carrying a `computed` derivation. */
export function isComputedField(field: FieldDefinition): field is ComputedField {
  return isValueField(field) && !!field.computed;
}

/** A {@link ValueField} whose choices the host resolves at runtime. */
export type DynamicOptionsField = ValueField & {
  optionsSource: NonNullable<ValueField["optionsSource"]>;
};

/** Narrows a field to an enum whose options come from an `OptionsResolver`. */
export function isDynamicOptionsField(field: FieldDefinition): field is DynamicOptionsField {
  return field.kind === "enum" && !!field.optionsSource;
}
