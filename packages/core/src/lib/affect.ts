import type { Affect, Condition, ConditionalRequiredField, FormDefinition, PathKey } from "../types";
import { resolveFieldByPath } from "./field";
import { fromPathKey, toPathKey } from "./path";

/** The visibility rules compiled for one field from every affect targeting it. */
export interface VisibilityRule {
  /** ALL must hold for the field to be visible; a `hide` rule contributes its negation. */
  conditions: Condition[];
  /** Whether the field's value is cleared while hidden (`hideAndClear`). */
  clearWhenHidden: boolean;
}

/** Compiled visibility rules, keyed by {@link toPathKey} of the target's path. */
export type VisibilityRules = Map<string, VisibilityRule>;

/**
 * Compiles a definition's affects into one visibility rule per targeted field.
 * Multiple affects on one target AND together; `populate` affects are side
 * effects, not visibility rules, and are skipped.
 */
export function compileAffects(affects: readonly Affect[] = []): VisibilityRules {
  const rules: VisibilityRules = new Map();

  const ruleFor = (path: readonly PathKey[]): VisibilityRule => {
    const key = toPathKey(path);
    let rule = rules.get(key);
    if (!rule) {
      rule = { conditions: [], clearWhenHidden: false };
      rules.set(key, rule);
    }
    return rule;
  };

  for (const affect of affects) {
    if (affect.effect === "populate") continue;

    for (const target of affect.targets) {
      const rule = ruleFor(target);
      // `show` is visible while the condition holds; both hide variants are its inverse
      rule.conditions.push(affect.effect === "show" ? affect.when : { not: affect.when });
      rule.clearWhenHidden ||= affect.effect === "hideAndClear";
    }
  }

  return rules;
}

/**
 * Every required field that a visibility affect targets, with the conditions
 * under which it is shown. These fields are optional in the built schema (a
 * hidden required field would invisibly block submit) and re-required by the
 * visibility-aware check in `buildFormSchema`.
 */
export function conditionalRequiredFields(definition: FormDefinition): ConditionalRequiredField[] {
  const conditionalFields: ConditionalRequiredField[] = [];

  for (const [key, rule] of compileAffects(definition.affects)) {
    const path = fromPathKey(key);
    const field = resolveFieldByPath(definition, path);
    if (!field || field.required === false) continue;

    conditionalFields.push({
      path,
      conditions: rule.conditions,
      requiredMessage: field.requiredMessage,
    });
  }

  return conditionalFields;
}
