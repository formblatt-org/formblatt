import { computed, watch } from "vue";
import { compileAffects, evaluate, fromPathKey, toPathKey } from "@formblatt/core";
import type { FormDefinition, PathKey } from "@formblatt/core";
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

  /** A field with no rules is always visible; rules on one field AND together. */
  const isVisible = (path: readonly PathKey[]): boolean => {
    const rule = rules.get(toPathKey(path));
    return !rule || rule.conditions.every(condition => evaluate(condition, read));
  };

  const clearableWhileHidden = [...rules]
    .filter(([, rule]) => rule.clearWhenHidden)
    .map(([key]) => fromPathKey(key));

  const pathsToClear = computed(() => clearableWhileHidden.filter(path => !isVisible(path)));

  watch(
    pathsToClear,
    paths => paths.forEach(path => clearInput(form, path)),
    { immediate: true, deep: true },
  );

  return { isVisible };
}
