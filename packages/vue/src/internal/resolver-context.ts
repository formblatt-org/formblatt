import { computed, reactive } from "vue";
import { toPathKey, type PathKey, type ValueReader } from "@formblatt/core";

/** A list of dependency paths, as `optionsSource.dependsOn` / `computed.dependsOn` declare them. */
export type DependencyPaths = readonly (readonly PathKey[])[];

/**
 * Reads declared dependencies into the `deps` record a host resolver receives,
 * keyed by the DOTTED path — `dependsOn: [["country"]]` arrives as
 * `deps.country`, `[["address", "country"]]` as `deps["address.country"]`.
 * Distinct paths therefore never collide.
 */
export function readDependencies(read: ValueReader, paths: DependencyPaths): Record<string, unknown> {
  const deps: Record<string, unknown> = {};

  for (const path of paths) {
    deps[path.join(".")] = read(path);
  }

  return deps;
}

/** Whether every dependency holds a value — a dependent field is meaningless otherwise. */
export function allDependenciesFilled(values: readonly unknown[]): boolean {
  return values.every(value => value != null && value !== "");
}

/** A path-addressed reactive boolean (loading, computing) for templates to read. */
export function createPathFlags() {
  const flags = reactive<Record<string, boolean>>({});

  return {
    set: (path: readonly PathKey[], value: boolean) => {
      flags[toPathKey(path)] = value;
    },
    isSet: (path: readonly PathKey[]) => !!flags[toPathKey(path)],
    /** Whether ANY path has its flag set — submit gates on this. */
    any: computed(() => Object.values(flags).some(Boolean)),
  };
}
