import * as v from "valibot";
import type { GenericSchema } from "valibot";
import type {
  FieldDefinition,
  FormDefinition,
  ObjectCheck,
  ObjectField,
  PathKey,
  ValidationRule,
  ValueField,
} from "../types";
import { conditionalRequiredFields } from "./affect";
import { evaluate, isEmpty, type ValueReader } from "./condition";
import { isValueField } from "./field";
import { getByPath, toPathKey } from "./path";

/** The shape a form's data takes: field names at the top level. */
type FormData = Record<string, unknown>;

/** The Valibot schema a {@link FormDefinition} compiles to. */
export type FormSchema = GenericSchema<FormData>;

/**
 * Path keys ({@link toPathKey}) of every field a visibility affect targets —
 * optional in their own schema, re-required by the required-when-visible pass.
 */
type ConditionalPaths = ReadonlySet<string>;

/** Host-tunable knobs of {@link buildFormSchema}. */
export interface BuildFormSchemaOptions {
  /**
   * Fallback message for required fields that declare no `requiredMessage` —
   * the i18n hook. Defaults to English ("This field is required").
   */
  requiredMessage?: string;
}

/** What every schema-building step needs — threaded instead of N loose params. */
interface BuildContext {
  conditionalPaths: ConditionalPaths;
  requiredMessage: string;
}

type ValidationAction = v.GenericPipeAction<any, any, any>;
type ValidationFactory = (rule: ValidationRule) => ValidationAction;

const DEFAULT_REQUIRED_MESSAGE = "This field is required";

const STRING_VALIDATIONS: Record<string, ValidationFactory> = {
  email: rule => v.email(rule.message),
  url: rule => v.url(rule.message),
  uuid: rule => v.uuid(rule.message),
  nonEmpty: rule => v.nonEmpty(rule.message),
  minLength: rule => v.minLength(rule.value as number, rule.message),
  maxLength: rule => v.maxLength(rule.value as number, rule.message),
  regex: rule => v.regex(new RegExp(rule.value as string), rule.message),
};

const NUMBER_VALIDATIONS: Record<string, ValidationFactory> = {
  minValue: rule => v.minValue(rule.value as number, rule.message),
  maxValue: rule => v.maxValue(rule.value as number, rule.message),
  integer: rule => v.integer(rule.message),
};

const BOOLEAN_VALIDATIONS: Record<string, ValidationFactory> = {
  // `required` on a boolean only demands presence — false is a value. This is
  // the "must accept the terms" rule: the box has to actually be checked.
  isTrue: rule => v.check(value => value === true, rule.message),
};

// ISO date strings compare lexicographically in date order, so valibot's
// generic min/max work on them directly.
const DATE_VALIDATIONS: Record<string, ValidationFactory> = {
  minValue: rule => v.minValue(rule.value as string, rule.message),
  maxValue: rule => v.maxValue(rule.value as string, rule.message),
};

/**
 * The validation rule types the builder implements per field kind — the
 * definition lint checks incoming rules against this. Enums validate through
 * their options / `nonEmpty` and support no extra rules.
 */
export const KNOWN_VALIDATION_TYPES: Record<ValueField["kind"], readonly string[]> = {
  string: Object.keys(STRING_VALIDATIONS),
  number: Object.keys(NUMBER_VALIDATIONS),
  boolean: Object.keys(BOOLEAN_VALIDATIONS),
  date: Object.keys(DATE_VALIDATIONS),
  enum: [],
};

/**
 * Valibot types `pipe` as a tuple of statically known actions; ours are
 * assembled at runtime from the definition. The cast lives here, once.
 */
const pipe = (schema: GenericSchema, ...actions: unknown[]): GenericSchema =>
  (v.pipe as any)(schema, ...actions);

/**
 * Forwards an action's error to the field at `path` so it renders under that
 * field. Valibot derives legal forward paths from the schema's static shape,
 * which cannot express our runtime-built paths — as with {@link pipe}, the
 * cast is contained here.
 */
const forwardTo = (action: ValidationAction, path: readonly PathKey[]): unknown =>
  v.forward(action as any, path as any);

/**
 * Compiles a form definition into the Valibot schema that validates its data.
 *
 * The schema always validates the WHOLE form, hidden fields included — so
 * visibility-controlled fields are made optional here and re-required by
 * {@link withRequiredWhenVisible}, otherwise a hidden required field would
 * block submit with an error the user can never see.
 */
export function buildFormSchema(
  definition: FormDefinition,
  options?: BuildFormSchemaOptions,
): FormSchema {
  const context: BuildContext = {
    conditionalPaths: collectConditionalPaths(definition),
    requiredMessage: options?.requiredMessage ?? DEFAULT_REQUIRED_MESSAGE,
  };
  const root = v.object(buildEntries(definition.fields, [], context));
  return withRequiredWhenVisible(root, definition, context.requiredMessage) as FormSchema;
}

/** Collects the targets of every visibility affect; `populate` targets nothing. */
function collectConditionalPaths(definition: FormDefinition): ConditionalPaths {
  const targets = (definition.affects ?? []).flatMap(affect =>
    affect.effect === "populate" ? [] : affect.targets,
  );
  return new Set(targets.map(toPathKey));
}

/** Builds the schema entries of one object level, keyed by field name. */
function buildEntries(
  fields: readonly FieldDefinition[],
  parentPath: readonly PathKey[],
  context: BuildContext,
): Record<string, GenericSchema> {
  return Object.fromEntries(
    fields.map(field => [
      field.name,
      buildField(field, [...parentPath, field.name], context),
    ]),
  );
}

/** Builds one field's schema and wraps it in `nullable` / `optional` as declared. */
function buildField(
  field: FieldDefinition,
  path: readonly PathKey[],
  context: BuildContext,
): GenericSchema {
  const enforcesRequired = enforcesOwnRequired(field, path, context.conditionalPaths);

  let schema = buildKindSchema(field, path, context, enforcesRequired);
  if (field.nullable) schema = v.nullable(schema);
  if (!enforcesRequired) schema = v.optional(schema);
  return schema;
}

/**
 * Whether the field carries its own required check. Not when explicitly
 * optional, targeted by a visibility affect (that case — including a `hidden`
 * field a `show` affect reveals — belongs to {@link withRequiredWhenVisible},
 * and enforcing it here too would report the same error twice), or never
 * fillable by the user: hidden with no revealing `show` affect, `disabled`,
 * or computed.
 */
function enforcesOwnRequired(
  field: FieldDefinition,
  path: readonly PathKey[],
  conditionalPaths: ConditionalPaths,
): boolean {
  if (field.required === false) return false;
  if (conditionalPaths.has(toPathKey(path))) return false;
  if (field.hidden || field.disabled) return false;
  return !(isValueField(field) && field.computed);
}

function buildKindSchema(
  field: FieldDefinition,
  path: readonly PathKey[],
  context: BuildContext,
  required: boolean,
): GenericSchema {
  switch (field.kind) {
    case "string": return buildStringSchema(field, required, context);
    case "number": return buildNumberSchema(field, required, context);
    case "enum": return buildEnumSchema(field, required, context);
    case "boolean": return buildBooleanSchema(field, required, context);
    case "date": return buildDateSchema(field, required, context);
    case "object": return buildObjectSchema(field, path, context);
    // every row shares one item schema, so the item's path carries no index
    case "array": return v.array(buildField(field.item, path, context));
  }
}

/** A required string must be non-empty; `""` reports as missing, not as a length error. */
function buildStringSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const validations = required
    ? [{ type: "nonEmpty", message: requiredMessageOf(field, context) }, ...(field.validations ?? [])]
    : field.validations;
  return withValidations(v.string(), validations, STRING_VALIDATIONS);
}

/**
 * A required number's *type* issue is the missing-value case (the input is
 * `number | undefined`), so it carries the required message instead of
 * "Expected number but received undefined". `NaN` fails the same way.
 */
function buildNumberSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const base = required ? v.number(requiredMessageOf(field, context)) : v.number();
  return withValidations(base, field.validations, NUMBER_VALIDATIONS);
}

/**
 * A deselected select stores `undefined`, so a required enum reports its type
 * issue as the missing-value case. Static options become a picklist; dynamic
 * ones are only known once the host resolves them, so the schema requires a
 * string — and for a required field also rejects `""`.
 */
function buildEnumSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const message = required ? requiredMessageOf(field, context) : undefined;

  if (field.optionsSource) {
    return message ? v.pipe(v.string(message), v.nonEmpty(message)) : v.string();
  }
  return v.picklist((field.options ?? []).map(option => option.value), message);
}

/**
 * A required boolean's *type* issue is the missing-value case, so it carries
 * the required message. `false` is a value — "must be checked" is the
 * `isTrue` validation, not `required`.
 */
function buildBooleanSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const base = required ? v.boolean(requiredMessageOf(field, context)) : v.boolean();
  return withValidations(base, field.validations, BOOLEAN_VALIDATIONS);
}

/**
 * A date is an ISO string, so a missing required one fails the *string* check
 * — which therefore carries the required message. A present but malformed
 * value keeps `isoDate`'s own error.
 */
function buildDateSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const base = required
    ? v.pipe(v.string(requiredMessageOf(field, context)), v.isoDate())
    : v.pipe(v.string(), v.isoDate());
  return withValidations(base, field.validations, DATE_VALIDATIONS);
}

/** Builds an object's entries, then applies its cross-field {@link ObjectCheck}s. */
function buildObjectSchema(
  field: ObjectField,
  path: readonly PathKey[],
  context: BuildContext,
): GenericSchema {
  const entries: GenericSchema = v.object(buildEntries(field.fields, path, context));
  return (field.checks ?? []).reduce(
    (schema, check) => pipe(schema, toCheckAction(check)),
    entries,
  );
}

/**
 * Compiles one cross-field check. Condition paths resolve relative to the
 * object being checked, so on an array item the same action runs per row.
 */
function toCheckAction(check: ObjectCheck): unknown {
  const passes = (data: FormData) => {
    const read: ValueReader = path => getByPath(data, path);
    return !evaluate(check.when, read) || evaluate(check.assert, read);
  };

  const action = v.check(passes, check.error);
  return check.target ? forwardTo(action, [check.target]) : action;
}

/**
 * Re-attaches required-ness to visibility-controlled fields as form-level
 * checks: required only while their affects show them, with the error
 * forwarded to the field so it renders in place.
 */
function withRequiredWhenVisible(
  root: GenericSchema,
  definition: FormDefinition,
  requiredMessage: string,
): GenericSchema {
  return conditionalRequiredFields(definition).reduce((schema, field) => {
    const filledWhenVisible = (data: FormData) => {
      const read: ValueReader = path => getByPath(data, path);
      const visible = field.conditions.every(condition => evaluate(condition, read));
      return !visible || !isEmpty(getByPath(data, field.path));
    };

    const action = v.check(filledWhenVisible, field.requiredMessage ?? requiredMessage);
    return pipe(schema, forwardTo(action, field.path));
  }, root);
}

/** Appends the validations the registry knows about; unknown rule types are ignored. */
function withValidations(
  base: GenericSchema,
  rules: readonly ValidationRule[] = [],
  registry: Record<string, ValidationFactory>,
): GenericSchema {
  const actions = rules
    .map(rule => registry[rule.type]?.(rule))
    .filter((action): action is ValidationAction => !!action);

  return actions.length ? pipe(base, ...actions) : base;
}

const requiredMessageOf = (field: FieldDefinition, context: BuildContext) =>
  field.requiredMessage ?? context.requiredMessage;

/**
 * Collects the `initial` values declared across a definition, optionally
 * hydrated with host data — an edit workflow's saved record. `initialData`
 * wins per key: plain objects merge recursively, arrays and scalars replace
 * wholesale, and `undefined` entries are ignored (JSON never carries them).
 * Fields without a value are absent (not `undefined`), and an object
 * contributes nothing unless a descendant has a value.
 */
export function buildInitialInput(
  definition: FormDefinition,
  initialData?: Record<string, unknown>,
): Record<string, unknown> {
  const declared = collectInitialValues(definition.fields);
  return initialData ? mergeInitial(declared, initialData) : declared;
}

/** `override` wins; plain objects merge recursively, everything else replaces. */
function mergeInitial(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const current = merged[key];
    merged[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeInitial(current, value)
      : value;
  }

  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectInitialValues(fields: readonly FieldDefinition[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const value = initialValueOf(field);
    if (value !== undefined) values[field.name] = value;
  }

  return values;
}

/** An object's initial value is assembled from its children; every other kind declares one. */
function initialValueOf(field: FieldDefinition): unknown {
  if (field.kind !== "object") return field.initial;

  const nested = collectInitialValues(field.fields);
  return Object.keys(nested).length ? nested : undefined;
}
