import type { Condition, PathKey } from "./condition";

/**
 * A declarative interaction rule, discriminated by `effect`.
 */
export type Affect =
  | {
    effect: "show" | "hide" | "hideAndClear";
    when: Condition;
    targets: readonly (readonly PathKey[])[];
  }
  | {
    effect: "populate";
    trigger: readonly PathKey[];
    source: string;
    allow?: readonly string[];
  };

/**
  * Runtime-internal
  */
export interface ConditionalRequiredField {
  path: PathKey[];
  conditions: Condition[];
  requiredMessage?: string;
}

/** One field write returned by a populate lookup. */
export interface PopulateEntry {
  /** Name of the (top-level) field to write. */
  name: string;
  value: unknown;
}

/**
 * What a `PopulateResolver` may return: a list of entries, a plain
 * `{ name: value }` record, or a single entry.
 */
export type PopulateResult = PopulateEntry[] | Record<string, unknown> | PopulateEntry;

/**
 * Host-implemented resolver for `populate` affects. Called with the trigger's
 * new non-empty value; the returned entries are written into the form.
 */
export type PopulateResolver = (
  source: string,
  value: unknown,
  ctx: { trigger: readonly PathKey[]; input: Record<string, unknown>; signal?: AbortSignal; }
) => Promise<PopulateResult> | PopulateResult;
