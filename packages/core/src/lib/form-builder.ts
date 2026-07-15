import * as v from "valibot";
import type { GenericSchema, GenericSchemaAsync } from "valibot";
import type {
  FieldDefinition,
  FormDefinition,
  ObjectCheck,
  ObjectField,
  PathKey,
  ValidationResolver,
  ValidationRule,
  ValueField,
} from "../types";
import { conditionalRequiredFields } from "./affect";
import { evaluate, isEmpty, type ValueReader } from "./condition";
import { reportError, warn } from "./diagnostics";
import { isValueField } from "./field";
import { getByPath, toPathKey } from "./path";

/** The shape a form's data takes: field names at the top level. */
type FormData = Record<string, unknown>;

/**
 * The Valibot schema a {@link FormDefinition} compiles to — async when the
 * definition declares `remote` validation rules, sync otherwise. Parse with
 * `safeParseAsync`, which handles both.
 */
export type FormSchema = GenericSchema<FormData> | GenericSchemaAsync<FormData>;

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
  /**
   * Host-defined validation rules, addressable from any field kind by their
   * key. Looked up AFTER the built-ins, so they cannot shadow one. Remember to
   * pass the keys to `validateDefinition` as `customRuleTypes`, or the lint
   * rejects definitions using them.
   */
  rules?: Record<string, ValidationFactory>;
  /**
   * Handles `remote` validation rules (username-taken, VAT lookup …). Without
   * it such rules are skipped with a warning. See {@link ValidationResolver}.
   */
  validationResolver?: ValidationResolver;
}

/** What every schema-building step needs — threaded instead of N loose params. */
interface BuildContext {
  conditionalPaths: ConditionalPaths;
  requiredMessage: string;
  kit: SchemaKit;
  customRules: Record<string, ValidationFactory>;
  validationResolver?: ValidationResolver;
}

type ValidationAction = v.GenericPipeAction<any, any, any>;

/**
 * Builds the valibot action for one {@link ValidationRule} — the shape of the
 * built-in registries and of host-defined rules (`BuildFormSchemaOptions.rules`).
 */
export type ValidationFactory = (rule: ValidationRule) => ValidationAction;

const DEFAULT_REQUIRED_MESSAGE = "This field is required";
const DEFAULT_REMOTE_MESSAGE = "Invalid value";

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
 * definition lint checks incoming rules against this. `remote` (host-resolved,
 * possibly async) works on every kind; enums otherwise validate through their
 * options / `nonEmpty` and support no extra built-ins.
 */
export const KNOWN_VALIDATION_TYPES: Record<ValueField["kind"], readonly string[]> = {
  string: [...Object.keys(STRING_VALIDATIONS), "remote"],
  number: [...Object.keys(NUMBER_VALIDATIONS), "remote"],
  boolean: [...Object.keys(BOOLEAN_VALIDATIONS), "remote"],
  date: [...Object.keys(DATE_VALIDATIONS), "remote"],
  enum: ["remote"],
};

/**
 * The valibot constructors one build uses — the `*Async` variants when the
 * definition declares any `remote` rule, since an async action needs an async
 * pipe and that asyncness propagates up to the root. Everything internal is
 * typed as the sync `GenericSchema` (valibot types `pipe`/`forward` from
 * statically known shapes, which runtime-built schemas cannot express); the
 * public {@link FormSchema} is the honest union. The casts live here, once.
 */
interface SchemaKit {
  object(entries: Record<string, GenericSchema>): GenericSchema;
  array(item: GenericSchema): GenericSchema;
  optional(schema: GenericSchema): GenericSchema;
  nullable(schema: GenericSchema): GenericSchema;
  pipe(schema: GenericSchema, ...actions: unknown[]): GenericSchema;
  /** Forwards an action's error to the field at `path`, so it renders under that field. */
  forward(action: ValidationAction, path: readonly PathKey[]): unknown;
}

const SYNC_KIT: SchemaKit = {
  object: entries => v.object(entries),
  array: item => v.array(item),
  optional: schema => v.optional(schema),
  nullable: schema => v.nullable(schema),
  pipe: (schema, ...actions) => (v.pipe as any)(schema, ...actions),
  forward: (action, path) => v.forward(action as any, path as any),
};

const ASYNC_KIT: SchemaKit = {
  object: entries => v.objectAsync(entries) as unknown as GenericSchema,
  array: item => v.arrayAsync(item) as unknown as GenericSchema,
  optional: schema => v.optionalAsync(schema) as unknown as GenericSchema,
  nullable: schema => v.nullableAsync(schema) as unknown as GenericSchema,
  pipe: (schema, ...actions) => (v.pipeAsync as any)(schema, ...actions),
  forward: (action, path) => v.forwardAsync(action as any, path as any),
};

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
    kit: hasRemoteRules(definition.fields) ? ASYNC_KIT : SYNC_KIT,
    customRules: options?.rules ?? {},
    validationResolver: options?.validationResolver,
  };
  const root = context.kit.object(buildEntries(definition.fields, [], context));
  return withRequiredWhenVisible(root, definition, context) as FormSchema;
}

/** Whether any field declares a `remote` rule — the whole schema goes async then. */
function hasRemoteRules(fields: readonly FieldDefinition[]): boolean {
  return fields.some(field => {
    if (field.kind === "object") return hasRemoteRules(field.fields);
    if (field.kind === "array") return hasRemoteRules([field.item]);
    return !!field.validations?.some(rule => rule.type === "remote");
  });
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
  if (field.nullable) schema = context.kit.nullable(schema);
  if (!enforcesRequired) schema = context.kit.optional(schema);
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
    case "array": return context.kit.array(buildField(field.item, path, context));
  }
}

/**
 * A required string must be non-empty; `""` reports as missing (via the
 * prepended `nonEmpty`), and so does `undefined` — the *type* issue carries
 * the required message too, like every other kind.
 */
function buildStringSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const validations = required
    ? [{ type: "nonEmpty", message: requiredMessageOf(field, context) }, ...(field.validations ?? [])]
    : field.validations;
  const base = required ? v.string(requiredMessageOf(field, context)) : v.string();
  return withValidations(base, validations, STRING_VALIDATIONS, context);
}

/**
 * A required number's *type* issue is the missing-value case (the input is
 * `number | undefined`), so it carries the required message instead of
 * "Expected number but received undefined". `NaN` fails the same way.
 */
function buildNumberSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const base = required ? v.number(requiredMessageOf(field, context)) : v.number();
  return withValidations(base, field.validations, NUMBER_VALIDATIONS, context);
}

/**
 * A deselected select stores `undefined`, so a required enum reports its type
 * issue as the missing-value case. Static options become a picklist; dynamic
 * ones are only known once the host resolves them, so the schema requires a
 * string — and for a required field also rejects `""`.
 */
function buildEnumSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const message = required ? requiredMessageOf(field, context) : undefined;

  const base = field.optionsSource
    ? (message ? v.pipe(v.string(message), v.nonEmpty(message)) : v.string())
    : v.picklist((field.options ?? []).map(option => option.value), message);
  // no enum-specific registry, but custom and remote rules still apply
  return withValidations(base, field.validations, {}, context);
}

/**
 * A required boolean's *type* issue is the missing-value case, so it carries
 * the required message. `false` is a value — "must be checked" is the
 * `isTrue` validation, not `required`.
 */
function buildBooleanSchema(field: ValueField, required: boolean, context: BuildContext): GenericSchema {
  const base = required ? v.boolean(requiredMessageOf(field, context)) : v.boolean();
  return withValidations(base, field.validations, BOOLEAN_VALIDATIONS, context);
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
  return withValidations(base, field.validations, DATE_VALIDATIONS, context);
}

/** Builds an object's entries, then applies its cross-field {@link ObjectCheck}s. */
function buildObjectSchema(
  field: ObjectField,
  path: readonly PathKey[],
  context: BuildContext,
): GenericSchema {
  const entries: GenericSchema = context.kit.object(buildEntries(field.fields, path, context));
  return (field.checks ?? []).reduce(
    (schema, check) => context.kit.pipe(schema, toCheckAction(check, context.kit)),
    entries,
  );
}

/**
 * Compiles one cross-field check. Condition paths resolve relative to the
 * object being checked, so on an array item the same action runs per row.
 */
function toCheckAction(check: ObjectCheck, kit: SchemaKit): unknown {
  const passes = (data: FormData) => {
    const read: ValueReader = path => getByPath(data, path);
    return !evaluate(check.when, read) || evaluate(check.assert, read);
  };

  const action = v.check(passes, check.error);
  return check.target ? kit.forward(action, [check.target]) : action;
}

/**
 * Re-attaches required-ness to visibility-controlled fields as form-level
 * checks: required only while their affects show them, with the error
 * forwarded to the field so it renders in place.
 */
function withRequiredWhenVisible(
  root: GenericSchema,
  definition: FormDefinition,
  context: BuildContext,
): GenericSchema {
  return conditionalRequiredFields(definition).reduce((schema, field) => {
    const filledWhenVisible = (data: FormData) => {
      const read: ValueReader = path => getByPath(data, path);
      const visible = field.conditions.every(condition => evaluate(condition, read));
      return !visible || !isEmpty(getByPath(data, field.path));
    };

    const action = v.check(filledWhenVisible, field.requiredMessage ?? context.requiredMessage);
    return context.kit.pipe(schema, context.kit.forward(action, field.path));
  }, root);
}

/**
 * Appends the validations the registries know about: built-ins first, then
 * the host's custom rules, `remote` routed to the resolver. Unknown rule
 * types are ignored — the lint rejects them upfront.
 */
function withValidations(
  base: GenericSchema,
  rules: readonly ValidationRule[] = [],
  registry: Record<string, ValidationFactory>,
  context: BuildContext,
): GenericSchema {
  const actions = rules
    .map(rule => toValidationAction(rule, registry, context))
    .filter((action): action is ValidationAction => !!action);

  return actions.length ? context.kit.pipe(base, ...actions) : base;
}

function toValidationAction(
  rule: ValidationRule,
  registry: Record<string, ValidationFactory>,
  context: BuildContext,
): ValidationAction | undefined {
  if (rule.type === "remote") return toRemoteAction(rule, context);

  const factory = registry[rule.type] ?? context.customRules[rule.type];
  return factory?.(rule);
}

/**
 * A host-resolved, possibly async check — `rule.value` is the routing key.
 * Empty values pass (that is `required`'s job), and a rejected lookup passes
 * too, with the failure reported: availability must not block submits.
 */
function toRemoteAction(rule: ValidationRule, context: BuildContext): ValidationAction | undefined {
  const resolve = context.validationResolver;
  const source = String(rule.value);

  if (!resolve) {
    warn("definition", `remote rule "${source}" has no ValidationResolver — skipped`);
    return undefined;
  }

  return v.rawCheckAsync(async ({ dataset, addIssue }) => {
    if (!dataset.typed || isEmpty(dataset.value)) return;

    try {
      const verdict = await resolve(source, dataset.value);
      if (verdict === true || verdict === undefined) return;
      addIssue({ message: typeof verdict === "string" ? verdict : rule.message ?? DEFAULT_REMOTE_MESSAGE });
    } catch (cause) {
      reportError("definition", `remote validation "${source}" failed — treated as valid`, cause);
    }
  }) as unknown as ValidationAction;
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
