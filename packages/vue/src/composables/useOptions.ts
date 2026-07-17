import { reactive, watch } from "vue";
import { isDynamicOptionsField, isEmpty, isValueField, reportError, toPathKey, walkValueFields, warn } from "@formblatt/core";
import type { FormDefinition, Option, OptionsResolver, PathKey } from "@formblatt/core";
import { createLatestOnly, isAbortError } from "../internal/latest-only";
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
  writeInput,
  type DynamicFormStore,
} from "../form-store";

/** One enum field whose choices the host resolves at runtime. */
interface DynamicOptions {
  path: PathKey[];
  source: string;
  dependsOn: DependencyPaths;
  /** A `multiple` enum holds a `string[]` — reconciling filters it instead of comparing it whole. */
  multiple: boolean;
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
  const errors = createPathFlags();
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
    const { isCurrent, signal } = latest.start(field.path);
    loading.set(field.path, true);
    errors.set(field.path, false);

    try {
      const options = await resolve!(field.source, {
        path: [...field.path],
        deps: readDependencies(read, field.dependsOn),
        input: readAllInput(form),
        signal,
      });

      if (isCurrent()) setOptions(field.path, options);
    } catch (cause) {
      // an aborted attempt was superseded by us — that is not a resolver failure
      if (!isAbortError(cause)) {
        reportError("options", `source "${field.source}" failed`, cause);
        if (isCurrent()) errors.set(field.path, true);
      }
    } finally {
      if (isCurrent()) loading.set(field.path, false);
    }
  };

  /**
   * Keeps a value the fresh options still offer; clears one they no longer do
   * — including after a successful load with NO options (nothing is choosable,
   * so no value can be right, and a stale one would silently submit). A FAILED
   * load keeps the value: wiping user state over an outage compounds the failure.
   * A `multiple` enum's `string[]` is filtered down to the choices still offered
   * rather than compared whole — switching a dependency keeps the overlap.
   */
  const reconcileValue = (field: DynamicOptions) => {
    const value = readInput(form, field.path);
    if (isEmpty(value)) return;
    if (errors.isSet(field.path)) return;

    const offered = new Set((optionsByPath[toPathKey(field.path)] ?? []).map(option => option.value));

    if (field.multiple && Array.isArray(value)) {
      const kept = value.filter((choice): choice is string => offered.has(choice as string));
      if (kept.length !== value.length) writeInput(form, field.path, kept);
    } else if (!offered.has(value as string)) {
      clearInput(form, field.path);
    }
  };

  const watchDependencies = (field: DynamicOptions) => {
    watch(
      () => field.dependsOn.map(read),
      async dependencyValues => {
        setOptions(field.path, []); // the loaded options belong to the previous dependency value
        errors.set(field.path, false); // ...and so does a failure

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
    /** Whether the LAST load for `path` failed — cleared when a reload starts or its dependencies change. */
    hasOptionsError: (path: readonly PathKey[]) => errors.isSet(path),
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
      multiple: !!field.multiple,
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
