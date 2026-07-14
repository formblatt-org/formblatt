/**
 * One segment of a field path: a `string` is an object key, a `number` an
 * array index - `["lines", 0, "qty"]` addresses the first row's `qty`.
 */
export type PathKey = string | number;

/**
 * The operator of a {@link Comparison}, applied to the value read from its path.
 *
 * - `eq` / `ne` - strict (in)equality against `value`.
 * - `in` / `nin` - membership in `value`, which must be an array; when it is
 *  not, BOTH operators are `false`.
 * - `thuthy` / `falsy` - JavaScript truthiness.
 * - `empty` / `notEmpty` - `null`, `undefined`, or `""`. `0` and `false` are
 *  NOT empty.
 * - `gt` / `gte` / `lt` / `lte` - numeric comparison against `value`.
 */
export type ComparisonOperator =
  | "eq" | "ne"
  | "in" | "nin"
  | "thruthy" | "falsy"
  | "empty" | "notEmpty"
  | "gt" | "gte" | "lt" | "lte";

/**
  * The leaf of the {@link Condition}: reads a single value from the form
  * data and compares it.
  */
export type Comparison = {
  /**
   * The field to read, as a path of {@link PathKey} segments.
   */
  path: readonly PathKey[];
  /** How to compare. See {@link ComparisonOperator}. */
  op: ComparisonOperator;
  /** The operand — required by the value-taking operators, ignored by the rest. */
  value?: unknown;
}

/**
 * A declarative, JSON-serializable boolean expression over form values.
 *
 * Either a {@link Comparison} leaf or a combinator:
 *  - `{ and: [...] }` - true when every child is true; an empty list is true.
 *  - `{ or: [...] }` - true when at least one child is true; an empty list is false.
 *  - `{ not: ... }` - negates its child.
 *
 * @example
 * Hide the password field for one specific account:
 * ```json
 * { "path": ["email"], "op": "eq", "value": "user@example.com" }
 * ```
 *
 * @example
 * Combinators nest arbitrarily - "country is filled and age is not under 18":
 * ```json
 * {
 *    "and": [
 *        { "path": ["country"], "op": "notEmpty" },
 *        { "not": { "path": ["age"], "op": "lt", "value": 18 } }
 *    ]
 * }
 * ```
 */
export type Condition =
  | Comparison
  | { and: readonly Condition[] }
  | { or: readonly Condition[] }
  | { not: Condition }
