import * as v from "valibot";
import type { Condition, Expression, FieldDefinition, FormDefinition, LayoutNode } from "../types";
import { fail } from "./diagnostics";

/** How many issues an error message lists before summarising the rest as a count. */
const MAX_REPORTED_ISSUES = 5;

/**
 * Runtime validation for incoming form definitions. The hand-written types in
 * ../types remain the canonical contract (valibot's lazy schemas cannot infer
 * recursion); these schemas mirror them, and the drift guard at the bottom
 * fails compilation if a schema ever accepts something outside the contract.
 */

const PathKeySchema = v.union([v.string(), v.number()]);
const PathSchema = v.array(PathKeySchema);
const PathsSchema = v.array(PathSchema);

// ---- conditions ----

const ComparisonSchema = v.object({
  path: PathSchema,
  op: v.picklist(["eq", "ne", "in", "nin", "truthy", "falsy", "empty", "notEmpty", "gt", "gte", "lt", "lte"]),
  value: v.optional(v.unknown()),
});

export const ConditionSchema: v.GenericSchema<Condition> = v.lazy(() =>
  v.union([
    ComparisonSchema,
    v.object({ and: v.array(ConditionSchema) }),
    v.object({ or: v.array(ConditionSchema) }),
    v.object({ not: ConditionSchema }),
  ])
);

// ---- expressions / computed ----

export const ExpressionSchema: v.GenericSchema<Expression> = v.lazy(() =>
  v.union([
    v.object({ ref: PathSchema }),
    v.object({ op: v.literal("concat"), args: v.array(ExpressionSchema), sep: v.optional(v.string()) }),
    v.object({ op: v.picklist(["add", "sub", "mul", "div"]), args: v.array(ExpressionSchema) }),
    v.object({ op: v.picklist(["min", "max"]), args: v.array(ExpressionSchema) }),
    v.object({ op: v.literal("coalesce"), args: v.array(ExpressionSchema) }),
    v.object({ op: v.literal("round"), args: v.tuple([ExpressionSchema]), precision: v.optional(v.number()) }),
    v.object({
      op: v.literal("dateDiff"),
      args: v.tuple([ExpressionSchema, ExpressionSchema]),
      unit: v.optional(v.picklist(["days", "month", "years"])),
    }),
    v.object({ op: v.literal("now") }),
    v.object({ if: ConditionSchema, then: ExpressionSchema, else: ExpressionSchema }),
    // strict + last: `const` may legitimately hold undefined, so a loose object
    // here would swallow every malformed expression in the union
    v.strictObject({ const: v.unknown() }),
  ])
);

const ComputedSchema = v.union([
  v.object({ expression: ExpressionSchema }),
  v.object({ source: v.string(), dependsOn: PathsSchema }),
]);

// ---- fields ----

const ValidationRuleSchema = v.object({
  type: v.string(),
  value: v.optional(v.unknown()),
  message: v.optional(v.string()),
});

const OptionSchema = v.object({
  label: v.string(),
  value: v.string(),
});

const baseFieldEntries = {
  name: v.string(),
  label: v.optional(v.string()),
  required: v.optional(v.boolean()),
  requiredMessage: v.optional(v.string()),
  hidden: v.optional(v.boolean()),
  disabled: v.optional(v.boolean()),
  nullable: v.optional(v.boolean()),
  validations: v.optional(v.array(ValidationRuleSchema)),
};

const ObjectCheckSchema = v.object({
  when: v.optional(ConditionSchema),
  assert: ConditionSchema,
  error: v.string(),
  target: v.optional(v.string()),
});

export const FieldDefinitionSchema: v.GenericSchema<FieldDefinition> = v.lazy(() =>
  v.variant("kind", [ValueFieldSchema, ObjectFieldSchema, ArrayFieldSchema])
);

const ValueFieldSchema = v.object({
  ...baseFieldEntries,
  kind: v.picklist(["string", "number", "boolean", "date", "enum"]),
  control: v.optional(v.picklist(["text", "email", "password", "number", "checkbox", "select", "textarea", "date"])),
  options: v.optional(v.array(OptionSchema)),
  optionsSource: v.optional(v.object({ source: v.string(), dependsOn: v.optional(PathsSchema) })),
  initial: v.optional(v.unknown()),
  computed: v.optional(ComputedSchema),
});

const ObjectFieldSchema = v.object({
  ...baseFieldEntries,
  kind: v.literal("object"),
  fields: v.array(FieldDefinitionSchema),
  checks: v.optional(v.array(ObjectCheckSchema)),
});

const ArrayFieldSchema = v.object({
  ...baseFieldEntries,
  kind: v.literal("array"),
  item: FieldDefinitionSchema,
  initial: v.optional(v.array(v.unknown())),
});

// ---- affects ----

const AffectSchema = v.variant("effect", [
  v.object({
    effect: v.picklist(["show", "hide", "hideAndClear"]),
    when: ConditionSchema,
    targets: PathsSchema,
  }),
  v.object({
    effect: v.literal("populate"),
    trigger: PathSchema,
    source: v.string(),
    allow: v.optional(v.array(v.string())),
  }),
]);

// ---- layout ----

export const LayoutNodeSchema: v.GenericSchema<LayoutNode> = v.lazy(() =>
  v.variant("type", [
    v.object({ type: v.literal("field"), name: v.string() }),
    v.object({
      type: v.literal("section"),
      id: v.string(),
      title: v.string(),
      collapsed: v.optional(v.boolean()),
      visibleWhen: v.optional(ConditionSchema),
      children: v.array(LayoutNodeSchema),
    }),
  ])
);

// ---- the definition ----

export const FormDefinitionSchema = v.object({
  schemaVersion: v.optional(v.number()),
  id: v.string(),
  validate: v.optional(v.picklist(["submit", "input", "change", "blur", "touch", "initial"])),
  revalidate: v.optional(v.picklist(["submit", "input", "change", "blur", "touch"])),
  fields: v.array(FieldDefinitionSchema),
  affects: v.optional(v.array(AffectSchema)),
  layout: v.optional(v.array(LayoutNodeSchema)),
  orphanSection: v.optional(v.object({
    title: v.string(),
    id: v.optional(v.string()),
    collapsed: v.optional(v.boolean()),
  })),
});

// compile-time drift guard (one-directional: whatever the schema accepts must
// be a valid FormDefinition — a typo'd picklist member here fails to compile)
type _SchemaMustMatchContract = v.InferOutput<typeof FormDefinitionSchema> extends FormDefinition ? true : never;
const _driftGuard: _SchemaMustMatchContract = true;
void _driftGuard;

/**
 * Validates a raw definition and throws a readable error listing what is
 * wrong and where; returns the input unchanged. Run AFTER `migrateDefinition`
 * — old versions are the migration chain's job, not the schema's.
 */
export function validateDefinition(definition: unknown): FormDefinition {
  const result = v.safeParse(FormDefinitionSchema, definition);
  if (result.success) return definition as FormDefinition;

  const id = (definition as { id?: unknown } | null)?.id;
  fail("definition",
    `invalid form definition "${typeof id === "string" ? id : "?"}":\n${describeIssues(result.issues)}`);
}

/** The first few issues as readable "- path: message" lines, with a count of the rest. */
function describeIssues(issues: readonly v.BaseIssue<unknown>[]): string {
  const shown = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map(issue => `- ${v.getDotPath(issue) ?? "(root)"}: ${issue.message}`)
    .join("\n");

  const remaining = issues.length - MAX_REPORTED_ISSUES;
  return remaining > 0 ? `${shown}\n… and ${remaining} more issue(s)` : shown;
}
