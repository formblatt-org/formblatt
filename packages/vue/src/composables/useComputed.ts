import { watch } from "vue";
import { evalExpression, getByPath, isComputedField, reportError, walkValueFields, warn } from "@formblatt/core";
import type {
  ArrayField,
  ComputedResolver,
  Expression,
  FieldDefinition,
  FormDefinition,
  PathKey,
} from "@formblatt/core";
import { createLatestOnly, isAbortError } from "../internal/latest-only";
import {
  createPathFlags,
  readDependencies,
  type DependencyPaths,
} from "../internal/resolver-context";
import {
  createReader,
  readAllInput,
  readInput,
  writeInputIfChanged,
  type DynamicFormStore,
} from "../form-store";

/** The host-resolved half of {@link Computed} — an opaque source plus its declared dependencies. */
interface ComputedSource {
  source: string;
  dependsOn: DependencyPaths;
}

const isArrayField = (field: FieldDefinition): field is ArrayField => field.kind === "array";

/**
 * Keeps computed fields in sync. Expression mode is synchronous and
 * self-tracking (Vue observes whatever the expression reads); source mode is
 * host-resolved on its declared dependencies, with stale responses discarded.
 * Returns `isComputing`, true per path while a source-mode value is in flight.
 */
export function useComputed(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolve?: ComputedResolver,
) {
  const computing = createPathFlags();
  const errors = createPathFlags();
  const latest = createLatestOnly();
  const read = createReader(form);

  /**
   * A non-finite number never enters the store — `NaN` is what arithmetic over
   * a not-yet-filled field produces (qty × price on a fresh row), `Infinity`
   * what a division by zero produces; both mean "no value".
   */
  const writeComputed = (path: readonly PathKey[], value: unknown) => {
    const normalized = typeof value === "number" && !Number.isFinite(value) ? undefined : value;
    writeInputIfChanged(form, path, normalized);
  };

  /** Vue tracks every ref the expression reads, so no dependencies need declaring. */
  const watchExpression = (path: readonly PathKey[], expression: Expression) => {
    watch(
      () => evalExpression(expression, read),
      value => writeComputed(path, value),
      { immediate: true },
    );
  };

  /** The resolver is opaque, so Vue cannot track it — recompute on the declared dependencies. */
  const watchSource = (path: readonly PathKey[], spec: ComputedSource) => {
    watch(
      () => spec.dependsOn.map(read),
      async () => {
        const { isCurrent, signal } = latest.start(path);
        computing.set(path, true);
        errors.set(path, false);

        try {
          const value = await resolve!(spec.source, {
            path: [...path],
            deps: readDependencies(read, spec.dependsOn),
            input: readAllInput(form),
            signal,
          });

          if (isCurrent()) writeComputed(path, value);
        } catch (cause) {
          // an aborted attempt was superseded by us — that is not a resolver failure
          if (!isAbortError(cause)) {
            reportError("computed", `source "${spec.source}" failed`, cause);
            if (isCurrent()) errors.set(path, true);
          }
        } finally {
          if (isCurrent()) computing.set(path, false);
        }
      },
      { immediate: true, deep: true },
    );
  };

  // every leaf outside an array, however deeply object-nested — refs stay absolute
  for (const { field, path } of walkValueFields(definition.fields)) {
    if (!isComputedField(field)) continue;
    const spec = field.computed;

    if ("expression" in spec) {
      watchExpression(path, spec.expression);
    } else if (resolve) {
      watchSource(path, spec);
    } else {
      warn("computed", `"${path.join(".")}" declares source "${spec.source}" but no ComputedResolver was given`);
    }
  }

  for (const field of definition.fields.filter(isArrayField)) {
    watchComputedItems(field);
  }

  /**
   * Per-row computed children, e.g. `lineTotal = qty × price`, at any object
   * depth within the item. One watcher per computed child observes the WHOLE
   * array — reading it through the store subscribes to row structure and every
   * row's inputs, so edits, inserts and removes all refire it. Refs are
   * relative to the row, as in ObjectChecks.
   */
  function watchComputedItems(arrayField: ArrayField) {
    const { item } = arrayField;
    if (item.kind !== "object") return;

    for (const { field: child, path: childPath } of walkValueFields(item.fields)) {
      if (!isComputedField(child)) continue;
      const spec = child.computed;

      if (!("expression" in spec)) {
        warn("computed",
          `"${arrayField.name}.${childPath.join(".")}": per-item computed supports expression mode only`);
        continue;
      }

      watch(
        () => readRows(arrayField.name).map(row =>
          evalExpression(spec.expression, path => getByPath(row, path))),
        values => values.forEach((value, index) =>
          writeComputed([arrayField.name, index, ...childPath], value)),
        { immediate: true },
      );
    }
  }

  function readRows(name: string): unknown[] {
    return (readInput(form, [name]) as unknown[] | null | undefined) ?? [];
  }

  return {
    isComputing: (path: readonly PathKey[]) => computing.isSet(path),
    /** True while ANY source-mode value is in flight — submitting then would ship a stale payload. */
    isComputingAny: computing.any,
    /** Whether the LAST recompute for `path` failed — the field keeps its previous value meanwhile. */
    hasComputedError: (path: readonly PathKey[]) => errors.isSet(path),
  };
}
