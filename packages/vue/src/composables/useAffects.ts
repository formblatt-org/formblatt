import { computed, watch } from "vue";
import { compileAffects, evaluate, fromPathKey, resolveFieldByPath, toPathKey } from "@formblatt/core";
import type { FormDefinition, PathKey, VisibilityRule } from "@formblatt/core";
import { clearInput, createReader, type DynamicFormStore } from "../form-store";

/**
 * Applies a definition's visibility affects to the live form. Visibility is
 * derived, not stored — {@link isVisible} evaluates the compiled rules on
 * every read. The one side effect is `hideAndClear`: a field it hides has its
 * value cleared, so stale hidden input is never submitted.
 */
export function useAffects(form: DynamicFormStore, definition: FormDefinition) {
  const rules = compileAffects(definition.affects);
  const read = createReader(form);

  /** Whether a rule's own conditions allow the field to show; no rule allows. */
  const ruleAllows = (rule: VisibilityRule | undefined): boolean =>
    !rule || rule.conditions.every(condition => evaluate(condition, read));

  /**
   * Rules on one field AND together. A statically `hidden` field shows only
   * while a `show` affect targets it and its rule holds — `hide` affects never
   * reveal one, they just add reasons to hide.
   */
  const isVisible = (path: readonly PathKey[]): boolean => {
    const rule = rules.get(toPathKey(path));
    if (resolveFieldByPath(definition, path)?.hidden && !rule?.revealsHidden) return false;
    return ruleAllows(rule);
  };

  const clearableWhileHidden = [...rules]
    .filter(([, rule]) => rule.clearWhenHidden)
    .map(([key]) => fromPathKey(key));

  // clearing follows the affect's own condition, not static `hidden` — a
  // permanently hidden target keeps its ride-along value until the rule triggers
  const pathsToClear = computed(() =>
    clearableWhileHidden.filter(path => !ruleAllows(rules.get(toPathKey(path)))));

  watch(
    pathsToClear,
    paths => paths.forEach(path => clearInput(form, path)),
    { immediate: true, deep: true },
  );

  return { isVisible };
}
