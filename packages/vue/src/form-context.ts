import { inject, type ComputedRef, type InjectionKey } from "vue";
import { fail } from "@formblatt/core";
import type { FormDefinition, Option, PathKey, ResolvedNode, ValueField } from "@formblatt/core";
import type { DynamicFormStore } from "./form-store";

/** A resolved layout section — the node kind `DynamicSection` renders. */
export type ResolvedSection = Extract<ResolvedNode, { type: "section" }>;

/**
 * Everything `DynamicForm` shares with the components rendering inside it.
 * Provided once per form; reached through {@link useFormContext}.
 */
export interface FormContext {
  form: DynamicFormStore;
  definition: FormDefinition;
  /** The definition's layout, resolved against its fields and ready to render. */
  resolvedLayout: ComputedRef<ResolvedNode[]>;

  /** Narrows a name to a renderable field — skips object/array kinds, warns on unknown. */
  resolveField(name: string): ValueField | undefined;

  /** Whether the field at `path` passes the visibility affects targeting it. */
  isVisible(path: readonly PathKey[]): boolean;
  /** Whether a section should render: its own condition holds and it has a visible child. */
  isSectionVisible(section: ResolvedSection): boolean;

  /** Host-resolved choices for the enum at `path`, or `undefined` before they load. */
  optionsFor(path: readonly PathKey[]): Option[] | undefined;
  isLoadingOptions(path: readonly PathKey[]): boolean;
  isComputing(path: readonly PathKey[]): boolean;

  /**
   * `"always"` shows field errors as soon as validation produces them;
   * `"touched"` hides them until the field was focused or a submit was attempted.
   */
  errorDisplay: ErrorDisplay;

  /**
   * Coverage tracking — called by whoever *decides* to place a field, before
   * the visibility `v-if` (a hidden field is still a placed field).
   */
  register(name: string): void;
  unregister(name: string): void;
}

export type ErrorDisplay = "always" | "touched";

export const FormContextKey: InjectionKey<FormContext> = Symbol("formblatt-form-context");

/** Reaches the enclosing `<DynamicForm>`. Throws when used outside one. */
export function useFormContext(): FormContext {
  const context = inject(FormContextKey, null);
  if (!context) {
    fail("form", "DynamicField / DynamicSection / DynamicLayout must be used inside <DynamicForm>");
  }
  return context;
}
