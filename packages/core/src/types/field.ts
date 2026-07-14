import { Computed } from "./computed";
import { Condition, PathKey } from "./condition";

/**
 * One validation applied to a field's value. Built-in types per kind -
 * strings: `email`, `url`, `uuid`, `nonEmpty`, `minLength`, `maxLength`;
 * numbers: `minValue`, `maxValue`, `integer`.
 */
export interface ValidationRule {
  /** Registry key of the rule, e.g. `minLength`. */
  type: string;
  /** The rule's operand, e.g. `8` for `minLength`. */
  value?: unknown;
  /** Overrides the rule's default error message. */
  message?: string;
}

/** Properties shared by every field kind. */
interface BaseField {
  /**
   * The field's identity: the object key in the submitted data, and the name
   * affects, layout and populate use to address it. Unique among siblings.
   */
  name: string;
  /** Display label */
  label?: string;
  required?: boolean;
  /** Overrides the default "This field is required" message. */
  requiredMessage?: string;
  /** Allows `null` as a value. */
  nullable?: boolean;
  /** Conntent validations, applied in order */
  validations?: readonly ValidationRule[]
}

/** One choice of a select control / static enum. */
export interface Option {
  label: string;
  /** Value stored in the form data when chosen. */
  value: string;
}

/**
 * A leaf field holding a single value - the only kind that renders as an
 * input control.
 */
export interface ValueField extends BaseField {
  kind: "string" | "number" | "boolean" | "date" | "enum";
  /** Which input control to render - presentation only. Defaults to a text input. */
  control?: "text" | "email" | "password" | "number" | "checkbox" | "select" | "textarea" | "date";
  /** Static choice list for `enum` fields. */
  options?: readonly Option[];
  /**
   * Host-resolved choices for `enum` fields; `source` routes to the host's
   * `OptionsResolver`.
   */
  optionsSource?: { source: string; dependsOn?: readonly (readonly PathKey[])[] };
  /** Pre-filled value. Must pass validation if the form validates on mount. */
  initial?: unknown;
  /** Makes the field derived (read-only, recomputed). See {@link Computed} */
  computed?: Computed;
}

/**
 * A cross-field check over an object's own data, with paths relative to the
 * object - on an array item it runs per row.
 *
 * @example
 * ```json
 * {
 *  when: { path: ["sku"], op: "eq", value: "CP-114" },
 *  assert: { path: ["qty"], op: "lte", value: 20 },
 *  target: "qty",
 *  error: "Max. qty 20"
 * }
 * ```
 */
export interface ObjectCheck {
  /** The check applies only while this holds. */
  when?: Condition;
  /** Must hold (given `when`), otherwise {@link error} is reported. */
  assert: Condition;
  error: string;
  /**
   * Key of this object to attach the error to, so it renders under that
   * field.
   */
  target?: string;
}

/**
 * A field grouping other fields as a nested object in the DATA
 * (`{ address: { city, zip } }`). For purely visual grouping use a layout
 * section — sections don't change the submitted shape.
 */
export interface ObjectField extends BaseField {
  kind: "object";
  fields: readonly FieldDefinition[];
}

/**
 * A field holding a list of rows, each shaped by {@link item} — one schema
 * shared by every row, so per-row differences are expressed with
 * {@link ObjectCheck}s, not by varying the item. Renders through the headless
 * `DynamicFieldArray`; the automatic layout skips arrays.
 */
export interface ArrayField extends BaseField {
  kind: "array";
  item: FieldDefinition;
  initial?: readonly unknown[]
}

/** Any field of the form, discriminated by `kind`. */
export type FieldDefinition = ValueField | ObjectField | ArrayField;

/**
 * Host-implemented resolver for dynamic enum options — the form never
 * fetches; it renders whatever comes back. May return a value or a promise.
 *
 * @param source - The routing key from the definition (`optionsSource.source`).
 * @param ctx.deps - Values of `optionsSource.dependsOn`, keyed by each path's
 *   LAST segment — `dependsOn: [["country"]]` arrives as `deps.country`.
 */
export type OptionsResolver = (
  source: string,
  ctx: { path: PathKey[]; deps: Record<string, unknown>; input: Record<string, unknown>; signal?: AbortSignal }
) => Promise<Option[]> | Option[];
