import { nextTick, onMounted } from "vue";
import { compileAffects, isComputedField, toPathKey, walkValueFields, warn } from "@formblatt/core";
import type { FormDefinition, ValueField } from "@formblatt/core";

type Placements = Map<string, number>;

/**
 * Dev-only guard against fields that are validated but never rendered — a
 * field the layout forgets is still required and blocks submit with an error
 * the user can never see. Components report every field they place (before
 * the visibility `v-if`: a hidden field is still a placed field) and the
 * tally is checked once the tree has mounted.
 */
export function useCoverageWarnings(definition: FormDefinition) {
  const placements: Placements = new Map();

  const register = (name: string) => {
    placements.set(name, (placements.get(name) ?? 0) + 1);
  };

  const unregister = (name: string) => {
    const remaining = (placements.get(name) ?? 1) - 1;
    if (remaining > 0) placements.set(name, remaining);
    else placements.delete(name);
  };

  onMounted(async () => {
    if (!isDevelopment()) return;
    await nextTick(); // let every child register before taking the tally

    warnDuplicatePlacements(placements);
    warnUnplacedFields(definition, placements);
  });

  return { register, unregister };
}

/** `import.meta.dev` under Nuxt, `import.meta.env.DEV` under plain Vite. */
function isDevelopment(): boolean {
  const meta = import.meta as unknown as { dev?: boolean; env?: { DEV?: boolean } };
  return !!(meta.dev ?? meta.env?.DEV);
}

function warnDuplicatePlacements(placements: Placements): void {
  const duplicated = [...placements]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  if (duplicated.length) {
    warn("form", `rendered more than once: ${duplicated.join(", ")}`);
  }
}

/**
 * Every leaf value field places by its dotted name (`"address.city"`), arrays
 * by their own name (`DynamicFieldArray` registers them). Computed fields are
 * always optional, and a `hidden` field no `show` affect can reveal never
 * renders (nor enforces required), so neither counts as missing — but a
 * hidden field a `show` affect CAN reveal does: once shown it is re-required,
 * so it still needs a place in the DOM.
 */
function warnUnplacedFields(definition: FormDefinition, placements: Placements): void {
  const revealable = new Set(
    [...compileAffects(definition.affects)]
      .filter(([, rule]) => rule.revealsHidden)
      .map(([key]) => key),
  );
  const neverRenders = (field: ValueField, path: string[]) =>
    !!field.hidden && !revealable.has(toPathKey(path));

  const expected: string[] = [];
  for (const { field, path } of walkValueFields(definition.fields)) {
    if (!isComputedField(field) && !neverRenders(field, path)) expected.push(path.join("."));
  }
  for (const field of definition.fields) {
    if (field.kind === "array") expected.push(field.name);
  }

  const unplaced = expected.filter(name => !placements.has(name));
  if (!unplaced.length) return;

  warn("form",
    "these fields are in the definition but not placed in the DOM — they are still " +
    `validated and can silently block submit: ${unplaced.join(", ")}`);
}
