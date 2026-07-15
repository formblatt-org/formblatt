import { computed, ref, watch } from "vue";
import { isEmpty, reportError, toPathKey } from "@formblatt/core";
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
  resetField,
  revalidate,
  writeInput,
  type DynamicFormStore,
} from "../form-store";

type PopulateAffect = Extract<Affect, { effect: "populate" }>;

const isPopulateAffect = (affect: Affect): affect is PopulateAffect =>
  affect.effect === "populate";

/**
 * Runs the definition's `populate` affects: a trigger taking a non-empty value
 * calls the host resolver and writes its entries into the form; emptying the
 * trigger reverts everything that rule wrote, so a deselected profile leaves
 * nothing of itself behind. Returns `isPopulating`, true while any lookup is
 * in flight — populate writes many fields at once, so the form blocks meanwhile.
 */
export function usePopulate(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolve: PopulateResolver,
) {
  const rules = (definition.affects ?? []).filter(isPopulateAffect);
  const latest = createLatestOnly();
  const pendingCount = ref(0);

  /** Field names each rule last wrote, keyed by its trigger path, so they can be reverted. */
  const writtenByRule = new Map<string, string[]>();

  const revert = (rule: PopulateAffect) => {
    const key = toPathKey(rule.trigger);
    const written = writtenByRule.get(key);
    if (!written?.length) return;

    written.forEach(name => resetField(form, [name]));
    writtenByRule.delete(key);
    // the reverted fields dropped their errors along with their values — keep isValid truthful
    revalidate(form);
  };

  const populate = async (rule: PopulateAffect, value: unknown) => {
    const isCurrent = latest.start(rule.trigger);
    pendingCount.value++;

    try {
      const result = await resolve(rule.source, value, {
        trigger: rule.trigger,
        input: readAllInput(form),
      });

      if (!isCurrent()) return; // the trigger changed again while this lookup was in flight
      writtenByRule.set(toPathKey(rule.trigger), applyResult(form, result, rule.allow));
    } catch (cause) {
      reportError("populate", `source "${rule.source}" failed`, cause);
    } finally {
      pendingCount.value--;
    }
  };

  for (const rule of rules) {
    watch(
      () => readInput(form, rule.trigger),
      value => {
        if (isEmpty(value)) {
          latest.cancel(rule.trigger); // a settling lookup must not repopulate what we just reverted
          revert(rule);
          return;
        }
        void populate(rule, value);
      },
    );
  }

  return { isPopulating: computed(() => pendingCount.value > 0) };
}

/**
 * Writes the resolver's entries, skipping fields the `allow` whitelist
 * excludes. Returns the names actually written — what a later revert undoes.
 */
function applyResult(
  form: DynamicFormStore,
  result: PopulateResult,
  allow?: readonly string[],
): string[] {
  const allowed = allow && new Set(allow);
  const written: string[] = [];

  for (const { name, value } of toEntries(result)) {
    if (allowed && !allowed.has(name)) continue;
    writeInput(form, [name], value);
    written.push(name);
  }

  return written;
}

/** A resolver may return a list of entries, a single entry, or a plain `{ name: value }` record. */
function toEntries(result: PopulateResult): PopulateEntry[] {
  if (Array.isArray(result)) return result;
  if ("name" in result && "value" in result) return [result as PopulateEntry];
  return Object.entries(result).map(([name, value]) => ({ name, value }));
}
