import type {
  Condition,
  Expression,
  FieldDefinition,
  FormDefinition,
  LayoutNode,
  ObjectField,
  PathKey,
  ValueField,
} from "../types";
import { BUILT_IN_CONTROLS } from "../types";
import { resolveFieldByNamePath } from "./field";
import { KNOWN_VALIDATION_TYPES } from "./form-builder";

/**
 * One problem the lint found. Errors describe definitions the engine will
 * mishandle (dead rules, silently dropped validations, broken required
 * handling); warnings describe definitions that work with caveats.
 */
export interface LintIssue {
  severity: "error" | "warning";
  /** Where the problem is, e.g. `fields.address.city` or `affects[0]`. */
  location: string;
  message: string;
}

/** Host-tunable knobs of {@link lintDefinition} / `validateDefinition`. */
export interface LintOptions {
  /**
   * Rule types the host registers with `buildFormSchema`'s `rules` option —
   * accepted on every field kind in addition to the built-ins.
   */
  customRuleTypes?: readonly string[];
  /**
   * Control names the host registers with `DynamicForm`'s `controls` prop —
   * accepted in addition to the built-in controls.
   */
  controls?: readonly string[];
}

/** {@link LintOptions} with defaults applied — what the checks receive. */
interface LintContext {
  customRuleTypes: readonly string[];
  controls: readonly string[];
}

/**
 * Checks a structurally valid definition for everything the shape schema
 * cannot see: referential integrity (affect targets, condition paths,
 * expression refs, layout names), validation rule types the builder actually
 * implements, and constructs the engine does not support. `validateDefinition`
 * runs this automatically — errors throw there, warnings are logged.
 */
export function lintDefinition(definition: FormDefinition, options?: LintOptions): LintIssue[] {
  const issues: LintIssue[] = [];
  const context: LintContext = {
    customRuleTypes: options?.customRuleTypes ?? [],
    controls: options?.controls ?? [],
  };

  lintFields(definition, definition.fields, "fields", false, issues, context);
  lintAffects(definition, issues);
  lintLayout(definition, issues);

  return issues;
}

const error = (issues: LintIssue[], location: string, message: string) =>
  issues.push({ severity: "error", location, message });

const warning = (issues: LintIssue[], location: string, message: string) =>
  issues.push({ severity: "warning", location, message });

const showPath = (path: readonly PathKey[]) => JSON.stringify(path);

// ---- resolution ----

/**
 * Resolves a path the way runtime reads do, but steps over an array boundary
 * even without an index — so "inside an array" and "does not exist" are
 * distinguishable in messages. `impliedIndex` marks that indexless step:
 * a runtime read of such a path yields `undefined`.
 */
function resolveForDiagnostics(
  fields: readonly FieldDefinition[],
  path: readonly PathKey[],
): { field?: FieldDefinition; viaArray: boolean; impliedIndex: boolean } {
  let siblings: readonly FieldDefinition[] = fields;
  let field: FieldDefinition | undefined;
  let viaArray = false;
  let impliedIndex = false;

  for (const key of path) {
    if (typeof key === "number") {
      if (field?.kind !== "array") return { viaArray, impliedIndex };
      field = field.item;
      viaArray = true;
    } else {
      // step over an array boundary without an index, so the caller can say "inside an array"
      if (field?.kind === "array") {
        viaArray = true;
        impliedIndex = true;
      }
      field = siblings.find(candidate => candidate.name === key);
      if (!field) return { viaArray, impliedIndex };
    }

    if (field.kind === "object") siblings = field.fields;
    else if (field.kind === "array") siblings = field.item.kind === "object" ? field.item.fields : [field.item];
    else siblings = [];
  }

  return { field, viaArray, impliedIndex };
}

// ---- condition / expression walking ----

/** Every comparison path a condition reads, at any depth. */
function collectConditionPaths(
  condition: Condition,
  paths: (readonly PathKey[])[] = [],
): (readonly PathKey[])[] {
  if ("and" in condition) condition.and.forEach(child => collectConditionPaths(child, paths));
  else if ("or" in condition) condition.or.forEach(child => collectConditionPaths(child, paths));
  else if ("not" in condition) collectConditionPaths(condition.not, paths);
  else paths.push(condition.path);
  return paths;
}

/** Every `ref` path an expression reads, including inside `if` conditions. */
function collectExpressionPaths(
  expression: Expression,
  paths: (readonly PathKey[])[] = [],
): (readonly PathKey[])[] {
  if ("const" in expression) return paths;
  if ("ref" in expression) {
    paths.push(expression.ref);
    return paths;
  }
  if ("if" in expression) {
    collectConditionPaths(expression.if, paths);
    collectExpressionPaths(expression.then, paths);
    collectExpressionPaths(expression.else, paths);
    return paths;
  }
  if (expression.op === "lookup") {
    collectExpressionPaths(expression.on, paths);
    if (expression.default) collectExpressionPaths(expression.default, paths);
    return paths;
  }
  if (expression.op !== "now") expression.args.forEach(arg => collectExpressionPaths(arg, paths));
  return paths;
}

type LookupExpression = Extract<Expression, { op: "lookup" }>;

/** Every `lookup` at any depth, for the enum-table checks. */
function collectLookups(
  expression: Expression,
  found: LookupExpression[] = [],
): LookupExpression[] {
  if ("const" in expression || "ref" in expression) return found;
  if ("if" in expression) {
    collectLookups(expression.then, found);
    collectLookups(expression.else, found);
    return found;
  }
  if (expression.op === "lookup") {
    found.push(expression);
    collectLookups(expression.on, found);
    if (expression.default) collectLookups(expression.default, found);
    return found;
  }
  if (expression.op !== "now") expression.args.forEach(arg => collectLookups(arg, found));
  return found;
}

/**
 * When `on` is a ref to a static-options enum, the options ARE the complete
 * key space — so a table key outside them is a typo, and an option with no
 * entry and no `default` is a guaranteed runtime miss. Both are things nested
 * `if` chains could never be checked for.
 */
function lintLookupTable(
  root: readonly FieldDefinition[],
  lookup: LookupExpression,
  location: string,
  issues: LintIssue[],
): void {
  if (!("ref" in lookup.on)) return;

  const { field } = resolveForDiagnostics(root, lookup.on.ref);
  if (!field || field.kind !== "enum" || field.multiple || !field.options?.length) return;

  const values = new Set(field.options.map(option => option.value));
  for (const key of Object.keys(lookup.table)) {
    if (!values.has(key)) {
      warning(issues, location, `lookup table key "${key}" matches no option of ${showPath(lookup.on.ref)}`);
    }
  }

  if (!lookup.default) {
    for (const value of values) {
      if (!Object.hasOwn(lookup.table, value)) {
        warning(issues, location,
          `option "${value}" of ${showPath(lookup.on.ref)} has no table entry and the lookup declares no default — it yields undefined`);
      }
    }
  }
}

/** Reports paths that read nothing: unresolvable, or crossing an array without an index. */
function lintReadPaths(
  root: readonly FieldDefinition[],
  paths: readonly (readonly PathKey[])[],
  location: string,
  what: string,
  issues: LintIssue[],
): void {
  for (const path of paths) {
    const resolved = resolveForDiagnostics(root, path);
    if (resolved.impliedIndex) {
      error(issues, location, `${what} ${showPath(path)} crosses an array without a row index — it always reads undefined`);
    } else if (!resolved.field) {
      error(issues, location, `${what} ${showPath(path)} does not resolve to a field`);
    }
  }
}

// ---- fields ----

function lintFields(
  definition: FormDefinition,
  fields: readonly FieldDefinition[],
  location: string,
  inArrayItem: boolean,
  issues: LintIssue[],
  context: LintContext,
): void {
  const seen = new Set<string>();

  for (const field of fields) {
    const here = `${location}.${field.name}`;

    if (!field.name) error(issues, location, "field with an empty name");
    if (field.name.includes(".")) {
      error(issues, here, `field name "${field.name}" contains a dot — dots address object leaves ("address.city") and must not appear in names`);
    }
    if (seen.has(field.name)) error(issues, here, `duplicate field name "${field.name}" among siblings`);
    seen.add(field.name);

    lintValidations(field, here, issues, context);

    switch (field.kind) {
      case "object":
        if (field.hidden || field.disabled) {
          error(issues, here, "hidden/disabled on an object field has no rendering effect — set it on its leaf fields");
        }
        lintObjectChecks(field, here, issues);
        lintFields(definition, field.fields, here, inArrayItem, issues, context);
        break;

      case "array":
        if (field.disabled) {
          error(issues, here, "disabled on an array field has no effect — set it on the item's fields");
        }
        if (location !== "fields") {
          warning(issues, here, "nested arrays validate but the built-in components cannot render them");
        }
        if (field.item.transient) {
          warning(issues, here, "transient on the array item strips nothing — mark the array itself, or individual item fields");
        }
        lintFields(definition, [field.item], `${here}.item`, true, issues, context);
        break;

      default:
        lintValueField(definition, field, here, inArrayItem, issues, context);
    }
  }
}

/** Checks a built-in rule's operand; returns what it should have been, or nothing when fine. */
type OperandCheck = (value: unknown) => string | undefined;

const finiteNumber: OperandCheck = value =>
  typeof value === "number" && Number.isFinite(value) ? undefined : "a finite number";

const isoDateString: OperandCheck = value =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? undefined : "an ISO date string (yyyy-mm-dd)";

const regexPattern: OperandCheck = value => {
  if (typeof value !== "string") return "a pattern string";
  try {
    new RegExp(value);
    return undefined;
  } catch {
    return "a compilable pattern (this one throws at schema build)";
  }
};

/**
 * Operand contracts of the built-in rules, per kind. The shape schema types
 * `value` as `unknown` (custom rules may take anything), so a wrong operand
 * would otherwise reach the builder's cast — and either throw at schema build
 * (an invalid `regex`) or compare nonsense forever (`minLength: "abc"`).
 */
const OPERAND_CHECKS: Record<ValueField["kind"], Record<string, OperandCheck>> = {
  string: { minLength: finiteNumber, maxLength: finiteNumber, regex: regexPattern },
  number: { minValue: finiteNumber, maxValue: finiteNumber },
  date: { minValue: isoDateString, maxValue: isoDateString },
  boolean: {},
  enum: {},
};

function lintValidations(
  field: FieldDefinition,
  location: string,
  issues: LintIssue[],
  context: LintContext,
): void {
  if (!field.validations?.length) return;

  if (field.kind === "object" || field.kind === "array") {
    error(issues, location, `${field.kind} fields do not support \`validations\` — the builder ignores them`);
    return;
  }

  const known = KNOWN_VALIDATION_TYPES[field.kind];
  for (const rule of field.validations) {
    if (rule.type === "remote") {
      if (typeof rule.value !== "string") {
        error(issues, location, "remote rules route by `value` — it must name the resolver source");
      }
      continue;
    }

    if (known.includes(rule.type)) {
      const problem = OPERAND_CHECKS[field.kind][rule.type]?.(rule.value);
      if (problem) {
        error(issues, location,
          `\`${rule.type}\` needs ${problem} as its \`value\`, got ${JSON.stringify(rule.value)}`);
      }
      continue;
    }

    // custom rules define their own operand contract — only the name is checkable
    if (context.customRuleTypes.includes(rule.type)) continue;
    error(issues, location,
      `unknown validation "${rule.type}" for kind "${field.kind}" — the builder would silently drop it (known: ${known.join(", ")})`);
  }
}

function lintValueField(
  definition: FormDefinition,
  field: ValueField,
  location: string,
  inArrayItem: boolean,
  issues: LintIssue[],
  context: LintContext,
): void {
  if (field.kind === "enum" && !field.options?.length && !field.optionsSource) {
    warning(issues, location, "static enum with no options accepts no value at all");
  }

  if (field.multiple && field.kind !== "enum") {
    error(issues, location, "`multiple` is an enum concern — other kinds hold a single value");
  }

  if (
    field.control &&
    !(BUILT_IN_CONTROLS as readonly string[]).includes(field.control) &&
    !context.controls.includes(field.control)
  ) {
    warning(issues, location,
      `control "${field.control}" is neither built-in nor registered — the field falls back to a text input`);
  }

  if (field.optionsSource) {
    if (inArrayItem) {
      error(issues, location, "optionsSource is not supported inside array items — the options would never load");
    } else {
      lintDependencies(definition, field.optionsSource.dependsOn ?? [], `${location}.optionsSource`, issues);
    }
  }

  if (!field.computed) return;

  if ("expression" in field.computed) {
    // top-level and object-nested refs are absolute; inside an array item they are row-relative
    const root = (inArrayItem ? rowRootOf(definition, location) : definition.fields) ?? definition.fields;
    lintReadPaths(root, collectExpressionPaths(field.computed.expression),
      `${location}.computed`, "ref", issues);
    for (const lookup of collectLookups(field.computed.expression)) {
      lintLookupTable(root, lookup, `${location}.computed`, issues);
    }
  } else if (inArrayItem) {
    error(issues, location, "source-mode computed is not supported inside array items — use an expression");
  } else {
    lintDependencies(definition, field.computed.dependsOn, `${location}.computed`, issues);
  }
}

/**
 * The sibling scope row-relative refs resolve against. Derived from the lint
 * location (`fields.lines.item[...]`): the innermost enclosing array's item.
 */
function rowRootOf(definition: FormDefinition, location: string): readonly FieldDefinition[] | undefined {
  const segments = location.split(".").slice(1); // drop the "fields" prefix
  let fields: readonly FieldDefinition[] = definition.fields;
  let root: readonly FieldDefinition[] | undefined;

  for (const segment of segments) {
    if (segment === "item") continue;
    const field = fields.find(candidate => candidate.name === segment);
    if (!field) return root;
    if (field.kind === "object") fields = field.fields;
    else if (field.kind === "array") {
      fields = field.item.kind === "object" ? field.item.fields : [field.item];
      root = fields;
    } else break;
  }

  return root;
}

/** dependsOn paths must resolve, and their terminal names must be distinct — `deps` is keyed by them. */
function lintDependencies(
  definition: FormDefinition,
  dependsOn: readonly (readonly PathKey[])[],
  location: string,
  issues: LintIssue[],
): void {
  lintReadPaths(definition.fields, dependsOn, location, "dependsOn path", issues);

  const terminals = dependsOn.map(path => String(path[path.length - 1]));
  const collisions = terminals.filter((name, index) => terminals.indexOf(name) !== index);
  if (collisions.length) {
    error(issues, location,
      `dependsOn terminal names collide (${[...new Set(collisions)].join(", ")}) — resolver deps are keyed by the last segment`);
  }
}

function lintObjectChecks(field: ObjectField, location: string, issues: LintIssue[]): void {
  (field.checks ?? []).forEach((check, index) => {
    const here = `${location}.checks[${index}]`;

    const paths = collectConditionPaths(check.assert);
    if (check.when) collectConditionPaths(check.when, paths);
    lintReadPaths(field.fields, paths, here, "check path", issues);

    if (!check.target) {
      warning(issues, here, "check without a target attaches its error to the object, which no control renders");
    } else if (!field.fields.some(child => child.name === check.target)) {
      error(issues, here, `check target "${check.target}" is not a child of this object`);
    }
  });
}

// ---- affects ----

function lintAffects(definition: FormDefinition, issues: LintIssue[]): void {
  (definition.affects ?? []).forEach((affect, index) => {
    const here = `affects[${index}]`;

    if (affect.effect === "populate") {
      lintReadPaths(definition.fields, [affect.trigger], here, "trigger", issues);
      for (const name of affect.allow ?? []) {
        if (!resolveFieldByNamePath(definition.fields, name.split("."))) {
          error(issues, here, `allow lists unknown field "${name}"`);
        }
      }
      return;
    }

    lintReadPaths(definition.fields, collectConditionPaths(affect.when), here, "condition path", issues);

    for (const target of affect.targets) {
      if (target.some(key => typeof key === "number")) {
        error(issues, here, `target ${showPath(target)} addresses an array row — affects cannot target rows (the shared item schema cannot vary per row)`);
        continue;
      }

      const resolved = resolveForDiagnostics(definition.fields, target);
      if (resolved.viaArray) {
        error(issues, here, `target ${showPath(target)} is inside an array item — affects cannot target fields inside arrays`);
      } else if (!resolved.field) {
        error(issues, here, `target ${showPath(target)} does not resolve to a field`);
      } else if (resolved.field.kind === "object") {
        error(issues, here, `target ${showPath(target)} is an object — target its leaf fields individually`);
      }
    }
  });
}

// ---- layout ----

function lintLayout(definition: FormDefinition, issues: LintIssue[]): void {
  if (!definition.layout) return;

  const nodeIds = new Map<string, number>();
  const orphanId = definition.orphanSection?.id ?? "__orphans";
  nodeIds.set(orphanId, definition.orphanSection ? 1 : 0);

  const visit = (nodes: readonly LayoutNode[], location: string, topLevel: boolean) => {
    nodes.forEach((node, index) => {
      const here = `${location}[${index}]`;

      if (node.type === "field") {
        const field = resolveFieldByNamePath(definition.fields, node.name.split("."));
        if (!field) {
          warning(issues, here, `layout references unknown field "${node.name}" — the node is skipped at render`);
        } else if (field.kind === "object" || field.kind === "array") {
          warning(issues, here, `layout references ${field.kind} field "${node.name}", which has no control — the node is skipped at render`);
        }
        return;
      }

      if (node.type === "page" && !topLevel) {
        error(issues, here, "pages are wizard steps — they can only appear at the top level of the layout");
      }

      nodeIds.set(node.id, (nodeIds.get(node.id) ?? 0) + 1);
      if (node.visibleWhen) {
        lintReadPaths(definition.fields, collectConditionPaths(node.visibleWhen), here, "visibleWhen path", issues);
      }
      visit(node.children, `${here}.children`, false);
    });
  };

  visit(definition.layout, "layout", true);

  // a page turns the whole layout into a wizard — a loose top-level sibling would never render
  const pageCount = definition.layout.filter(node => node.type === "page").length;
  if (pageCount > 0 && pageCount < definition.layout.length) {
    error(issues, "layout", "a layout with pages must consist of pages only at the top level");
  }

  for (const [id, count] of nodeIds) {
    if (count > 1) error(issues, "layout", `section/page id "${id}" is used ${count} times — ids must be unique`);
  }
}
