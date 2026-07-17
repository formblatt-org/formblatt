import type { Condition, PathKey } from "./condition";

/**
 * A declarative interaction rule, discriminated by `effect`.
 *
 * Visibility rules (`show` / `hide` / `hideAndClear`) are derived state: while
 * `when` holds, the targets are shown (or hidden). Multiple rules on one
 * target AND together, and `hideAndClear` also clears a target's value when
 * it hides, so stale hidden input is never submitted. Targets are
 * automatically made optional in the built schema and guarded by a
 * visibility-aware required check instead — a hidden required field would
 * otherwise block submit invisibly.
 *
 * `populate` is an event-driven side effect: when the trigger takes a
 * non-empty value the host's `PopulateResolver` runs and its entries are
 * written into the form; emptying the trigger restores the values the rule
 * overwrote — a user's earlier input included — and discards any in-flight
 * lookup.
 */
export type Affect =
  | {
      effect: "show" | "hide" | "hideAndClear";
      /** `show`: targets visible while true. `hide` / `hideAndClear`: hidden while true. */
      when: Condition;
      /** The fields this rule controls — one path per field. */
      targets: readonly (readonly PathKey[])[];
    }
  | {
      effect: "populate";
      /** Path of the field whose changes fire the lookup (typically a select). */
      trigger: readonly PathKey[];
      /** Routing key handed to the host's `PopulateResolver`. */
      source: string;
      /**
       * Whitelist of field names the resolver may write — without it a
       * misbehaving resolver can overwrite any field in the form.
       */
      allow?: readonly string[];
    }

/**
 * Runtime-internal: one entry of the compiled required-when-visible pass —
 * a required field that is an affect target, with its visibility conditions.
 * Not part of the wire contract.
 */
export interface ConditionalRequiredField {
  path: PathKey[];
  /** ALL must hold for the field to be visible, and therefore required. */
  conditions: Condition[];
  /** The field's `requiredMessage`, if it overrides the default. */
  requiredMessage?: string;
}

/** One field write returned by a populate lookup. */
export interface PopulateEntry {
  /** Name of the field to write — dotted to reach an object leaf (`"address.city"`). */
  name: string;
  value: unknown;
}

/**
 * What a `PopulateResolver` may return: a list of entries, a plain
 * `{ name: value }` record, or a single entry — all normalized to the same writes.
 */
export type PopulateResult = PopulateEntry[] | Record<string, unknown> | PopulateEntry;

/**
 * Host-implemented resolver for `populate` affects. Called with the trigger's
 * new non-empty value; the returned entries are written into the form,
 * filtered by the rule's `allow` list (entries naming unknown fields are
 * skipped with a warning). Never called for an emptied trigger — that
 * restores the overwritten values instead. Stale results are discarded — and
 * `ctx.signal` is aborted when a newer lookup (or an emptied trigger)
 * supersedes this one, so pass it to `fetch`. The whole form blocks (`inert`)
 * while a lookup is pending, since populate writes across many fields at once.
 */
export type PopulateResolver = (
  source: string,
  value: unknown,
  ctx: { trigger: readonly PathKey[]; input: Record<string, unknown>; signal?: AbortSignal }
) => Promise<PopulateResult> | PopulateResult;
