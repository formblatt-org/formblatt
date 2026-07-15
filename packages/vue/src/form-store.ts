import {
  getDirtyInput,
  getInput,
  insert,
  isDirty,
  move,
  remove,
  reset,
  setErrors,
  setInput,
  swap,
  validate,
  type FormStore,
} from "@formisch/vue";
import type { FormSchema, PathKey, ValueReader } from "@formblatt/core";

/** The formisch store backing a formblatt form. */
export type DynamicFormStore = FormStore<FormSchema>;

/**
 * formisch types `path` as a non-empty tuple derived from the schema; formblatt
 * builds paths at runtime, and they can address array items — which a
 * `GenericSchema<Record<string, unknown>>` cannot express. Every store access
 * goes through this module, so the mismatch is asserted once, here.
 */
const args = (path: readonly PathKey[], rest: object = {}): any => ({ path, ...rest });

/** The value at `path`, or `undefined` while it is unset. */
export function readInput(form: DynamicFormStore, path: readonly PathKey[]): unknown {
  return getInput(form, args(path));
}

/** The whole form's current input — what resolvers receive as `ctx.input`. */
export function readAllInput(form: DynamicFormStore): Record<string, unknown> {
  return getInput(form) as Record<string, unknown>;
}

/** Binds a {@link ValueReader} to the live store, for conditions and expressions. */
export function createReader(form: DynamicFormStore): ValueReader {
  return path => readInput(form, path);
}

/** Writes `value` at `path`. */
export function writeInput(form: DynamicFormStore, path: readonly PathKey[], value: unknown): void {
  setInput(form, args(path, { input: value }));
}

/** Writes only when the value differs, so a same-result recompute wakes no watchers. */
export function writeInputIfChanged(
  form: DynamicFormStore,
  path: readonly PathKey[],
  value: unknown,
): void {
  if (readInput(form, path) !== value) writeInput(form, path, value);
}

/** Clears the value at `path`, if it holds one. */
export function clearInput(form: DynamicFormStore, path: readonly PathKey[]): void {
  writeInputIfChanged(form, path, undefined);
}

/** Restores the field at `path` to the initial value the form was built with. */
export function resetField(form: DynamicFormStore, path: readonly PathKey[]): void {
  reset(form, args(path));
}

/** Re-runs validation — needed after a programmatic write that may have cleared errors. */
export function revalidate(form: DynamicFormStore): void {
  validate(form);
}

/**
 * Sets the errors of the field at `path`, or clears them with `null` — how
 * server-side validation lands on a field. The next validation run (an edit,
 * under the default `revalidate: "input"`) replaces them with schema results.
 */
export function writeFieldErrors(
  form: DynamicFormStore,
  path: readonly PathKey[],
  errors: readonly string[] | null,
): void {
  setErrors(form, args(path, { errors: errors?.length ? [...errors] : null }));
}

/**
 * Whether any field's value differs from the initial input — the
 * unsaved-changes signal. Reactive when read from a render context or
 * computed; a populate revert or reset makes it `false` again.
 */
export function isFormDirty(form: DynamicFormStore): boolean {
  return isDirty(form);
}

/** Only the values that differ from the initial input — e.g. a PATCH payload. */
export function readDirtyInput(form: DynamicFormStore): unknown {
  return getDirtyInput(form);
}

/** Appends a row to the array field at `path`. */
export function insertItem(
  form: DynamicFormStore,
  path: readonly PathKey[],
  initialInput?: unknown,
): void {
  insert(form, args(path, { initialInput }));
}

/** Removes the row at index `at` from the array field at `path`. */
export function removeItem(form: DynamicFormStore, path: readonly PathKey[], at: number): void {
  remove(form, args(path, { at }));
}

/** Moves the row at `from` to index `to` within the array field at `path`. */
export function moveItem(
  form: DynamicFormStore,
  path: readonly PathKey[],
  from: number,
  to: number,
): void {
  move(form, args(path, { from, to }));
}

/** Exchanges the rows at indexes `at` and `and` within the array field at `path`. */
export function swapItems(
  form: DynamicFormStore,
  path: readonly PathKey[],
  at: number,
  and: number,
): void {
  swap(form, args(path, { at, and }));
}
