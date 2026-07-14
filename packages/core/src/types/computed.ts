import type { Condition, PathKey } from "./condition";

/**
 * A JSON-serializable, synchronously evaluated value expression - the language
 * of {@link Computed} fields in expression mode. Re-evaluated reactively
 * whenever a field read through a `ref` changes.
 *
 * - `{ const }` - a literal value.
 * - `{ ref }` - reads a field.
 * - `concat` - joins `String(arg)` with `sep` (default: `""`).
 * - `add` / `sub` / `mul` / `div` - left-to-right arithemtic over `Number(arg)`.
 * - `min` / `max` - over `Number(arg)`.
 * - `coalesce` - the first arg that is not `null` / `undefined`
 * - `round` - its single arg to `precicion` decimals (default `0`).
 * - `dateDiff` - whole units from the first date to the second: `days` divides
 *  elapsed time, `month` / `years` are calendar-aware. Unparsable dates yield
 *  `undefined`.
 * - `now` - the current `Date`.
 * - `{ if, then, else }` - branches on a {@link Condition}.
 *
 * Arithemtic over missing refs produces `NaN`, which the engine converts to
 * `undefined` at the store boundary.
 */
export type Expression =
  | { const: unknown }
  | { ref: readonly PathKey[] }
  | { op: "concat"; args: readonly Expression[]; sep?: string }
  | { op: "add" | "sub" | "mul" | "div"; args: readonly Expression[] }
  | { op: "min" | "max"; args: readonly Expression[] }
  | { op: "coalesce"; args: readonly Expression[] }
  | { op: "round"; args: readonly [Expression]; precision?: number }
  | { op: "dateDiff"; args: readonly [Expression, Expression]; unit?: "days" | "month" | "year" }
  | { op: "now" }
  | { if: Condition; then: Expression; else: Expression };

  /**
   * A field's derivation - its value is computed, never typed by the user.
   *
   * - `{ expression }` - synchronous, in-form; dependencies are tracked
   *  automatically from the `ref` it reads.
   * - `{ source, dependsOn }` - host-resolved, possibly async. The resolver is
   *  opaque, so the fields it reads must be declared; stale responses are
   *  discarded when a newer recompute starts.
   */
export type Computed =
  | { expression: Expression }
  | { source: string; dependsOn: readonly (readonly PathKey[])[] };

  /**
   * Host-implemented resolver for source-mode {@link Computed} fields. May
   * return a value or a promise.
   *
   * @param source - The routing key from the definition (`computed.source`).
   * @param ctx.deps - Declared dependencies keyed by each path's last segment-
   *  `dependsOn: [["lines"]]` arrives as `deps.lines`.
   */
export type ComputedResolver = (
  source: string,
  ctx: { path: PathKey[]; deps: Record<string, unknown>; input: Record<string, unknown>; signal?: AbortSignal }
) => Promise<unknown> | unknown;
