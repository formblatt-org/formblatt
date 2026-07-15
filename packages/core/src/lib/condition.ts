import type { Comparison, Condition, PathKey } from "../types";

/**
 * Reads the value at a path — how conditions and expressions reach form data.
 * The same condition works against the live store and a parsed dataset;
 * only the reader differs.
 */
export type ValueReader = (path: readonly PathKey[]) => unknown;

/**
 * Whether a value counts as "no input": `null`, `undefined` or `""`.
 * `0` and `false` are values — required checks depend on this distinction.
 */
export function isEmpty(value: unknown): boolean {
  return value == null || value === "";
}

/**
 * Evaluates a condition against form data. An absent condition is `true`
 * ("always"), so an optional `when` passes through without a guard.
 */
export function evaluate(condition: Condition | undefined, read: ValueReader): boolean {
  if (!condition) return true;
  if ("and" in condition) return condition.and.every(child => evaluate(child, read));
  if ("or" in condition) return condition.or.some(child => evaluate(child, read));
  if ("not" in condition) return !evaluate(condition.not, read);
  return compare(condition, read(condition.path));
}

/** Applies a comparison's operator to the value read from its path. */
function compare(comparison: Comparison, actual: unknown): boolean {
  const { op, value } = comparison;

  switch (op) {
    case "eq": return actual === value;
    case "ne": return actual !== value;
    // a non-array operand makes membership meaningless — `nin` stays false too
    case "in": return Array.isArray(value) && value.includes(actual);
    case "nin": return Array.isArray(value) && !value.includes(actual);
    case "truthy": return !!actual;
    case "falsy": return !actual;
    case "empty": return isEmpty(actual);
    case "notEmpty": return !isEmpty(actual);
    case "gt": return (actual as number) > (value as number);
    case "gte": return (actual as number) >= (value as number);
    case "lt": return (actual as number) < (value as number);
    case "lte": return (actual as number) <= (value as number);
  }
}
