import { reactive, watch } from "vue";
import { isDynamicOptionsField, isEmpty, reportError, toPathKey, warn } from "@formblatt/core";
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

        // with a dependency empty there is nothing to choose from, so no value can be valid
        if (!allDependenciesFilled(dependencyValues)) {
          clearInput(form, field.path);
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
  };
}

function collectDynamicOptions(definition: FormDefinition): DynamicOptions[] {
  return definition.fields.filter(isDynamicOptionsField).map(field => ({
    path: [field.name],
    source: field.optionsSource.source,
    dependsOn: field.optionsSource.dependsOn ?? [],
  }));
}
