import { computed, ref, watch } from "vue";
import { isEmpty, reportError, resolveFieldByNamePath, toPathKey, warn } from "@formblatt/core";
import type {
  Affect,
  FormDefinition,
  PopulateEntry,
  PopulateResolver,
  PopulateResult,
} from "@formblatt/core";
import { createLatestOnly } from "../internal/latest-only";
import {
  readAllInput,
  readInput,
  revalidate,
  writeInput,
  type DynamicFormStore,
} from "../form-store";

type PopulateAffect = Extract<Affect, { effect: "populate" }>;

const isPopulateAffect = (affect: Affect): affect is PopulateAffect =>
  affect.effect === "populate";

/** The values a rule overwrote (pre-populate), keyed by entry name — what a revert restores. */
type Overwritten = Map<string, unknown>;

/**
 * Runs the definition's `populate` affects: a trigger taking a non-empty value
 * calls the host resolver and writes its entries into the form; emptying the
 * trigger restores every value the rule overwrote — a user's earlier input
 * included — so a deselected profile leaves nothing of itself behind. Returns
 * `isPopulating`, true while any lookup is in flight — populate writes many
 * fields at once, so the form blocks meanwhile.
 */
export function usePopulate(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolve?: PopulateResolver,
) {
  const rules = (definition.affects ?? []).filter(isPopulateAffect);
  const latest = createLatestOnly();
  const pendingCount = ref(0);
  const failed = ref(false);

  if (rules.length && !resolve) {
    warn("populate", "the definition declares populate affects but no PopulateResolver was given — they will not run");
  }

  /** Each rule's pre-populate values, keyed by its trigger path, so they can be restored. */
  const overwrittenByRule = new Map<string, Overwritten>();

  const revert = (rule: PopulateAffect) => {
    const key = toPathKey(rule.trigger);
    const overwritten = overwrittenByRule.get(key);
    if (!overwritten?.size) return;

    overwritten.forEach((previous, name) => writeInput(form, name.split("."), previous));
    overwrittenByRule.delete(key);
    // the restored fields changed values wholesale — keep isValid truthful
    revalidate(form);
  };

  const populate = async (rule: PopulateAffect, value: unknown) => {
    const isCurrent = latest.start(rule.trigger);
    pendingCount.value++;
    failed.value = false;

    try {
      const result = await resolve!(rule.source, value, {
        trigger: rule.trigger,
        input: readAllInput(form),
      });

      if (!isCurrent()) return; // the trigger changed again while this lookup was in flight
      applyResult(form, definition, rule, result, overwrittenByRule);
    } catch (cause) {
      reportError("populate", `source "${rule.source}" failed`, cause);
      if (isCurrent()) failed.value = true;
    } finally {
      pendingCount.value--;
    }
  };

  for (const rule of resolve ? rules : []) {
    watch(
      () => readInput(form, rule.trigger),
      value => {
        if (isEmpty(value)) {
          latest.cancel(rule.trigger); // a settling lookup must not repopulate what we just reverted
          failed.value = false; // an emptied trigger asks for nothing — no failure to report
          revert(rule);
          return;
        }
        void populate(rule, value);
      },
    );
  }

  return {
    isPopulating: computed(() => pendingCount.value > 0),
    /** Whether the LAST lookup failed (form-level — populate writes many fields). Cleared when a new lookup starts or the trigger empties. */
    hasPopulateError: computed(() => failed.value),
  };
}

/**
 * Writes the resolver's entries, skipping fields the `allow` whitelist
 * excludes and names that resolve to no field. Before each name's FIRST write
 * it records the value being overwritten, so a later revert restores what the
 * user (or the initial input) had there — not the field's reset state.
 */
function applyResult(
  form: DynamicFormStore,
  definition: FormDefinition,
  rule: PopulateAffect,
  result: PopulateResult,
  overwrittenByRule: Map<string, Overwritten>,
): void {
  const allowed = rule.allow && new Set(rule.allow);
  const key = toPathKey(rule.trigger);
  const overwritten = overwrittenByRule.get(key) ?? new Map<string, unknown>();

  for (const { name, value } of toEntries(result)) {
    if (allowed && !allowed.has(name)) continue;

    const path = name.split(".");
    if (!resolveFieldByNamePath(definition.fields, path)) {
      warn("populate", `resolver returned unknown field "${name}" — skipped`);
      continue;
    }

    if (!overwritten.has(name)) overwritten.set(name, readInput(form, path));
    writeInput(form, path, value);
  }

  if (overwritten.size) overwrittenByRule.set(key, overwritten);
}

/** A resolver may return a list of entries, a single entry, or a plain `{ name: value }` record. */
function toEntries(result: PopulateResult): PopulateEntry[] {
  if (Array.isArray(result)) return result;
  if ("name" in result && "value" in result) return [result as PopulateEntry];
  return Object.entries(result).map(([name, value]) => ({ name, value }));
}
