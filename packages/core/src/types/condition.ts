/**
 * One segment of a field path: a `string` is an object key, a `number` an
 * array index — `["lines", 0, "qty"]` addresses the first row's `qty`.
 */
export type PathKey = string | number;

/**
 * The operator of a {@link Comparison}, applied to the value read from its path.
 *
 * - `eq` / `ne` — strict (in)equality against `value`.
 * - `in` / `nin` — membership in `value`, which must be an array; when it is
 *   not, BOTH operators are `false` (`nin` does not fall back to `true`).
 * - `truthy` / `falsy` — JavaScript truthiness; `value` is ignored.
 * - `empty` / `notEmpty` — `null`, `undefined` or `""`. `0` and `false` are
 *   NOT empty, matching the engine's required checks.
 * - `gt` / `gte` / `lt` / `lte` — numeric comparison against `value`.
 */
export type ComparisonOperator =
  | "eq" | "ne"
  | "in" | "nin"
  | "truthy" | "falsy"
  | "empty" | "notEmpty"
  | "gt" | "gte" | "lt" | "lte";

/**
 * The leaf of the {@link Condition} AST: reads one value from the form data
 * and compares it.
 */
export type Comparison = {
  /**
   * The field to read. Absolute (from the form root) in affects,
   * required-when-visible checks and section `visibleWhen`; RELATIVE to the
   * object being checked inside `checks` — which is what makes per-row rules
   * on array items possible.
   */
  path: readonly PathKey[];
  /** How to compare. See {@link ComparisonOperator}. */
  op: ComparisonOperator;
  /** The operand — required by the value-taking operators, ignored by the rest. */
  value?: unknown;
}

/**
 * A declarative, JSON-serializable boolean expression over form values —
 * every "when" in the contract: affect visibility, `ObjectCheck` assertions,
 * section `visibleWhen`, and `if` branches in computed expressions.
 *
 * Either a {@link Comparison} leaf or a combinator:
 * - `{ and: [...] }` — every child true; an empty list is true.
 * - `{ or: [...] }` — at least one child true; an empty list is false.
 * - `{ not: ... }` — negates its child.
 *
 * @example
 * "country is filled and age is not under 18":
 * ```json
 * { "and": [
 *   { "path": ["country"], "op": "notEmpty" },
 *   { "not": { "path": ["age"], "op": "lt", "value": 18 } }
 * ] }
 * ```
 */
export type Condition =
  | Comparison
  | { and: readonly Condition[] }
  | { or: readonly Condition[] }
  | { not: Condition }
