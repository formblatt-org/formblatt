import { reactive, watch } from "vue";
import { isDynamicOptionsField, isEmpty, isValueField, reportError, toPathKey, walkValueFields, warn } from "@formblatt/core";
import type { FormDefinition, Option, OptionsResolver, PathKey } from "@formblatt/core";
import { createLatestOnly } from "../internal/latest-only";
import {
  allDependenciesFilled,
  createPathFlags,
  readDependencies,
  type DependencyPaths,
} from "../internal/resolver-context";
import {
  clearInput,
  createReader,
  readAllInput,
  readInput,
  type DynamicFormStore,
} from "../form-store";

/** One enum field whose choices the host resolves at runtime. */
interface DynamicOptions {
  path: PathKey[];
  source: string;
  dependsOn: DependencyPaths;
}

/**
 * Loads host-resolved enum options. A field with no `dependsOn` loads once on
 * mount; a dependent one reloads when its dependencies change, and its value
 * is then RECONCILED against the fresh options — kept if still valid, cleared
 * if not. Reconciling rather than blindly clearing lets a populate write and
 * a cascade land in either order without one wiping the other.
 */
export function useOptions(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolve?: OptionsResolver,
) {
  const optionsByPath = reactive<Record<string, Option[]>>({});
  const loading = createPathFlags();
  const latest = createLatestOnly();
  const read = createReader(form);
  const dynamicFields = collectDynamicOptions(definition);

  if (dynamicFields.length && !resolve) {
    warn("options", "the definition declares optionsSource fields but no OptionsResolver was given — their options will never load");
  }
  warnArrayItemOptions(definition);

  const setOptions = (path: readonly PathKey[], options: Option[]) => {
    optionsByPath[toPathKey(path)] = options;
  };

  const load = async (field: DynamicOptions) => {
    const isCurrent = latest.start(field.path);
    loading.set(field.path, true);

    try {
      const options = await resolve!(field.source, {
        path: [...field.path],
        deps: readDependencies(read, field.dependsOn),
        input: readAllInput(form),
      });

      if (isCurrent()) setOptions(field.path, options);
    } catch (cause) {
      reportError("options", `source "${field.source}" failed`, cause);
    } finally {
      if (isCurrent()) loading.set(field.path, false);
    }
  };

  /** Keeps a value the fresh options still offer; clears one they no longer do. */
  const reconcileValue = (field: DynamicOptions) => {
    const value = readInput(form, field.path);
    if (isEmpty(value)) return;

    const options = optionsByPath[toPathKey(field.path)] ?? [];
    if (options.length && !options.some(option => option.value === value)) {
      clearInput(form, field.path);
    }
  };

  const watchDependencies = (field: DynamicOptions) => {
    watch(
      () => field.dependsOn.map(read),
      async dependencyValues => {
        setOptions(field.path, []); // the loaded options belong to the previous dependency value

        // with a dependency empty there is nothing to choose from, so no value can be valid.
        // An already-empty value is left alone: a pristine string-ish leaf holds "" (formisch's
        // empty input), and re-writing it marks the field touched — which would surface its
        // required error on a form nobody has interacted with.
        if (!allDependenciesFilled(dependencyValues)) {
          if (!isEmpty(readInput(form, field.path))) clearInput(form, field.path);
          return;
        }

        await load(field);
        reconcileValue(field);
      },
      { immediate: true, deep: true },
    );
  };

  for (const field of resolve ? dynamicFields : []) {
    if (field.dependsOn.length) watchDependencies(field);
    else void load(field);
  }

  return {
    optionsFor: (path: readonly PathKey[]): Option[] | undefined => optionsByPath[toPathKey(path)],
    isLoadingOptions: (path: readonly PathKey[]) => loading.isSet(path),
    /** True while ANY options load is in flight — its reconcile pass may still clear a value. */
    isLoadingAnyOptions: loading.any,
  };
}

/** Every dynamic-options enum outside an array, however deeply object-nested. */
function collectDynamicOptions(definition: FormDefinition): DynamicOptions[] {
  const collected: DynamicOptions[] = [];

  for (const { field, path } of walkValueFields(definition.fields)) {
    if (!isDynamicOptionsField(field)) continue;
    collected.push({
      path,
      source: field.optionsSource.source,
      dependsOn: field.optionsSource.dependsOn ?? [],
    });
  }

  return collected;
}

/** Defense in depth — the lint rejects these, but a definition can bypass `validateDefinition`. */
function warnArrayItemOptions(definition: FormDefinition): void {
  for (const field of definition.fields) {
    if (field.kind !== "array") continue;

    const leaves = field.item.kind === "object"
      ? walkValueFields(field.item.fields, [field.name])
      : isValueField(field.item) ? [{ field: field.item, path: [field.name] }] : [];

    for (const entry of leaves) {
      if (isDynamicOptionsField(entry.field)) {
        warn("options",
          `"${entry.path.join(".")}": optionsSource is not supported inside array items — its options will never load`);
      }
    }
  }
}
