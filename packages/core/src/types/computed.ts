import type { Condition, PathKey } from "./condition";

/**
 * A JSON-serializable, synchronously evaluated value expression — the language
 * of {@link Computed} fields in expression mode. Re-evaluated reactively
 * whenever a field read through a `ref` changes.
 *
 * - `{ const }` — a literal value.
 * - `{ ref }` — reads a field; absolute at the top level, RELATIVE to the row
 *   inside array items.
 * - `concat` — joins `String(arg)` with `sep` (default `""`); nullish args
 *   become empty strings.
 * - `add` / `sub` / `mul` / `div` — left-to-right arithmetic over
 *   `Number(arg)`; `args` must be non-empty (the reduction has no seed).
 * - `min` / `max` — over `Number(arg)`.
 * - `coalesce` — the first arg that is not `null`/`undefined`/`""`, else
 *   `undefined`.
 * - `round` — its single arg to `precision` decimals (default `0`).
 * - `dateDiff` — whole units from the first date to the second: `days` divides
 *   elapsed time, `month` / `years` are calendar-aware. Unparseable dates
 *   yield `undefined`. Note the spelling: singular `month`.
 * - `now` — the current `Date`; re-evaluates on reactive changes, not a timer.
 * - `{ if, then, else }` — branches on a {@link Condition}.
 * - `lookup` — evaluates `on`, coerces it to a string key (`42` keys as
 *   `"42"`) and yields that entry of `table`. An empty key (`null` /
 *   `undefined` / `""`) or a missing entry yields `default` — itself an
 *   expression — or `undefined` without one. Only the table's OWN entries
 *   match: a value like `"constructor"` cannot reach the prototype.
 *
 * Arithmetic over missing refs produces `NaN`, which the engine converts to
 * `undefined` at the store boundary — `coalesce` in a `{ const: 0 }` when a
 * default is wanted instead.
 */
export type Expression =
  | { const: unknown }
  | { ref: readonly PathKey[] }
  | { op: "concat"; args: readonly Expression[]; sep?: string }
  | { op: "add" | "sub" | "mul" | "div"; args: readonly Expression[] }
  | { op: "min" | "max"; args: readonly Expression[] }
  | { op: "coalesce"; args: readonly Expression[] }
  | { op: "round"; args: readonly [Expression]; precision?: number }
  | { op: "dateDiff"; args: readonly [Expression, Expression]; unit?: "days" | "month" | "years" }
  | { op: "now" }
  | { op: "lookup"; on: Expression; table: Readonly<Record<string, unknown>>; default?: Expression }
  | { if: Condition; then: Expression; else: Expression };

/**
 * A field's derivation — its value is computed, never typed by the user.
 *
 * - `{ expression }` — synchronous, in-form; dependencies are tracked
 *   automatically from the `ref`s it reads.
 * - `{ source, dependsOn }` — host-resolved, possibly async. The resolver is
 *   opaque, so the fields it reads must be declared; stale responses are
 *   discarded when a newer recompute starts.
 *
 * On a field inside an array item the expression runs PER ROW with
 * row-relative `ref`s; source mode is not supported there. Computed fields are
 * always optional in the built schema, and chains must be acyclic.
 */
export type Computed =
  | { expression: Expression }
  | { source: string; dependsOn: readonly (readonly PathKey[])[] };

/**
 * Host-implemented resolver for source-mode {@link Computed} fields. May
 * return a value or a promise; while pending the field reports as computing,
 * and a result superseded by a dependency change is discarded.
 *
 * @param source - The routing key from the definition (`computed.source`).
 * @param ctx.deps - Declared dependencies keyed by each path's LAST segment —
 *   `dependsOn: [["lines"]]` arrives as `deps.lines`; keep terminal names distinct.
 */
export type ComputedResolver = (
  source: string,
  ctx: { path: PathKey[]; deps: Record<string, unknown>; input: Record<string, unknown>; signal?: AbortSignal }
) => Promise<unknown> | unknown;
