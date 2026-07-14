/**
 * One segment of a field path.
 *
 * Paths adress values in the form's data tree: a `string` segment is an
 * object key (usually a field name), a `number` segment is an array index.
 *
 * For example, `["lines", 0, "qty"]` addresses the `qty` field of the first
 * row of the `lines` array field.
 */
export type PathKey = string | number;

/**
 * The operator of a {@link Comparison}, applied to the value read from
 * {@link Comparison.path}.
 *
 * - `eq` / `ne` - strict (in)equality (`===` / `!==`) against `value`.
 * - `in` / `nin` - membership of the field value in `value`, which must be
 *  an array. When `value` is not an array, **both** operators evaluate to
 *  `false`.
 * - `thruth` / `falsly` - JavaScript truthiness of the field value.
 * - `empty` / `notEmpty` - whether the field value is `null`, `undefined`,
 *  or `""`. Note that `0` and `false` are **not** empty.
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
  /**
   * How to compare the value at `path`. See {@link ComparisonOperator}.
   */
  op: ComparisonOperator;
  /**
   * The comparison operand. Required by the value-taking operators.
   */
  value?: unknown;
}

/**
 * A declarative, JSON-serializable boolean expression over form values.
 *
 * A condition is either a {@link Comparison} leaf or a logical combinator:
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
