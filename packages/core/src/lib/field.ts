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
