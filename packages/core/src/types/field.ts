import type { Condition, PathKey } from "./condition";
import type { Computed } from "./computed";

/**
 * One validation applied to a field's value. Built-in types per kind —
 * strings: `email`, `url`, `uuid`, `nonEmpty`, `minLength`, `maxLength`,
 * `regex`; numbers: `minValue`, `maxValue`, `integer`; booleans: `isTrue`
 * (must be checked — `required` only demands presence, and `false` is
 * present); dates: `minValue`, `maxValue` (ISO strings, compared in date
 * order). Every kind additionally accepts `remote` (host-resolved through a
 * {@link ValidationResolver}, `value` is the routing key) and any rule the
 * host registers via `buildFormSchema`'s `rules` option. Enums otherwise
 * validate through their options and support no extra built-ins. The builder
 * ignores unknown types, so a typo weakens validation without an error — run
 * `validateDefinition` on served definitions; its lint rejects rule types
 * nothing implements.
 */
export interface ValidationRule {
  /** Registry key of the rule, e.g. `"minLength"`. */
  type: string;
  /** The rule's operand, e.g. `8` for `minLength` or a pattern for `regex`. */
  value?: unknown;
  /** Overrides the rule's default error message. */
  message?: string;
}

/**
 * Host-implemented handler for `remote` validation rules — the async check a
 * schema cannot express (username-taken, VAT lookup). Called with the rule's
 * routing key (`rule.value`) and the field's current value; never called for
 * empty values (that is `required`'s job). Return `true`/`undefined` for
 * valid, `false` for invalid with the rule's message, or a string to use as
 * the message. A rejected promise is reported and treated as valid —
 * availability must not block submits. Hosts should cache: the check runs on
 * every validation pass of the form.
 */
export type ValidationResolver = (
  source: string,
  value: unknown,
) => boolean | string | undefined | Promise<boolean | string | undefined>;

/** Properties shared by every field kind. */
interface BaseField {
  /**
   * The field's identity: the object key in the submitted data, and the name
   * affects, layout and populate use to address it. Unique among siblings.
   */
  name: string;
  /** Display label — rendering only. */
  label?: string;
  /**
   * Defaults to `true`. Fields targeted by a visibility affect are re-required
   * through the visibility-aware check instead, so a hidden required field
   * never blocks submit invisibly.
   */
  required?: boolean;
  /** Overrides the default "This field is required" message. */
  requiredMessage?: string;
  /**
   * Defaults to `false`. Hides the field; only a `show` affect targeting it
   * can reveal it — `hide` affects never do, they just add reasons to hide.
   * Either way the field stays in the data: `initial`, computed and populated
   * values still submit. A hidden field no `show` affect targets never
   * enforces `required` (its error could never be seen); a revealed one is
   * re-required while visible, like any conditional field. Content
   * validations always apply.
   */
  hidden?: boolean;
  /**
   * Defaults to `false`. Renders the field's control disabled. Like `computed`
   * fields, a disabled field never enforces `required` — the user cannot fill
   * it in — though content validations still apply.
   */
  disabled?: boolean;
  /** Allows `null` as a value. */
  nullable?: boolean;
  /** Content validations, applied in order after the kind's base check. */
  validations?: readonly ValidationRule[]
}

/** One choice of a select control / static enum. */
export interface Option {
  label: string;
  /** Value stored in the form data when chosen. */
  value: string;
}

/** The controls `DynamicInput` renders itself; anything else must be a host-registered control. */
export const BUILT_IN_CONTROLS = [
  "text", "email", "password", "number", "checkbox", "select", "textarea", "date", "radio",
] as const;

export type BuiltInControl = (typeof BUILT_IN_CONTROLS)[number];

/**
 * A leaf field holding a single value — the only kind that renders as an
 * input control.
 *
 * - `date` values are ISO strings (`"1996-06-10"`), never `Date` objects.
 * - `enum` with static {@link options} validates against exactly those values;
 *   with {@link optionsSource} it accepts any string, since the valid set is
 *   only known once the host resolves it. With {@link multiple} the value is
 *   a `string[]` instead.
 * - A deselected select and an emptied number input store `undefined`, not
 *   `""` / `NaN`.
 */
export interface ValueField extends BaseField {
  kind: "string" | "number" | "boolean" | "date" | "enum";
  /**
   * Which input control to render — presentation only. Defaults to a text
   * input. A name outside {@link BUILT_IN_CONTROLS} renders the host's
   * registered control of that name (`DynamicForm`'s `controls` prop).
   */
  control?: BuiltInControl | (string & {});
  /** Static choice list for `enum` fields. */
  options?: readonly Option[];
  /**
   * `enum` only: the value is a `string[]` of distinct choices — rendered as
   * a checkbox group (a `<select multiple>` would demand ctrl+click).
   * `required` demands at least one choice; note a visibility-controlled
   * required multi-enum accepts an empty selection (`[]` counts as filled
   * there).
   */
  multiple?: boolean;
  /**
   * Host-resolved choices for `enum` fields; `source` routes to the host's
   * `OptionsResolver`. With `dependsOn` the options cascade: a dependency
   * change reloads them, and the current value is kept only if the fresh
   * options still offer it (e.g. country → state).
   */
  optionsSource?: { source: string;  dependsOn?: readonly (readonly PathKey[])[] }
  /** Pre-filled value. Must pass validation if the form validates on mount. */
  initial?: unknown;
  /** Makes the field derived (read-only, recomputed). See {@link Computed}. */
  computed?: Computed;
}

/**
 * A cross-field check over an object's own data, with paths RELATIVE to the
 * object — on an array item it runs per row, which is how per-row rules exist
 * at all (every row shares one item schema, so `validations` cannot vary).
 * Runs only once the object's entries are themselves valid.
 *
 * @example
 * ```json
 * {
 *   "when":   { "path": ["sku"], "op": "eq",  "value": "CP-114" },
 *   "assert": { "path": ["qty"], "op": "lte", "value": 20 },
 *   "target": "qty",
 *   "error":  "Max. qty 20"
 * }
 * ```
 */
export interface ObjectCheck {
  /** The check applies only while this holds; omit for "always". */
  when?: Condition;
  /** Must hold (given `when`), otherwise {@link error} is reported. */
  assert: Condition;
  error: string;
  /**
   * Key of this object to attach the error to, so it renders under that
   * field. Without it the error lands on the object itself, which no control
   * renders — in practice, always set it.
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
  /** Cross-field rules over this object's data. See {@link ObjectCheck}. */
  checks?: readonly ObjectCheck[]
}

/**
 * A field holding a list of rows, each shaped by {@link item} — one schema
 * shared by every row, so per-row differences are expressed with
 * {@link ObjectCheck}s, not by varying the item. Renders through the headless
 * `DynamicFieldArray`; the automatic layout skips arrays.
 */
export interface ArrayField extends BaseField {
  kind: "array";
  /** The schema every row conforms to. */
  item: FieldDefinition;
  /** Initial rows. */
  initial?: readonly unknown[]
}

/** Any field of the form, discriminated by `kind`. */
export type FieldDefinition = ValueField | ObjectField | ArrayField;

/**
 * Host-implemented resolver for dynamic enum options — the form never
 * fetches; it renders whatever comes back. May return a value or a promise;
 * while pending the select shows its loading state, and a response superseded
 * by a dependency change is discarded.
 *
 * @param source - The routing key from the definition (`optionsSource.source`).
 * @param ctx.deps - Values of `optionsSource.dependsOn`, keyed by each path's
 *   LAST segment — `dependsOn: [["country"]]` arrives as `deps.country`.
 */
export type OptionsResolver = (
  source: string,
  ctx: { path: PathKey[]; deps: Record<string, unknown>; input: Record<string, unknown>; signal?: AbortSignal }
) => Promise<Option[]> | Option[];
