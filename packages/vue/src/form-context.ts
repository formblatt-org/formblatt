import { inject, type Component, type ComputedRef, type InjectionKey } from "vue";
import { fail } from "@formblatt/core";
import type { FormDefinition, Option, PathKey, ResolvedNode, ValueField } from "@formblatt/core";
import type { PagesApi } from "./composables/usePages";
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

  /** Whether the field at `path` should render — its affects' conditions hold, and a statically `hidden` field is targeted by a `show` affect. */
  isVisible(path: readonly PathKey[]): boolean;
  /** Whether a section should render: its own condition holds and it has a visible child. */
  isSectionVisible(section: ResolvedSection): boolean;

  /** Host-resolved choices for the enum at `path`, or `undefined` before they load. */
  optionsFor(path: readonly PathKey[]): Option[] | undefined;
  isLoadingOptions(path: readonly PathKey[]): boolean;
  isComputing(path: readonly PathKey[]): boolean;
  /** Whether the last options load for `path` failed — the field renders its load-failed state. */
  hasOptionsError(path: readonly PathKey[]): boolean;
  /** Whether the last source-mode recompute for `path` failed — the value shown may be stale. */
  hasComputedError(path: readonly PathKey[]): boolean;

  /**
   * `"always"` shows field errors as soon as validation produces them;
   * `"touched"` hides them until the field was focused or a submit was attempted.
   */
  errorDisplay: ErrorDisplay;

  /** The form's UI strings, defaults merged with the `text` prop. */
  text: ComputedRef<UiText>;

  /**
   * Host-registered controls by name (`DynamicForm`'s `controls` prop). A
   * field whose `control` matches renders that component inside the field
   * scaffold — it receives {@link CustomControlProps} and emits
   * `update:input` with the new value.
   */
  controls: Record<string, Component>;

  /** Wizard state when the layout declares pages. See {@link PagesApi}. */
  pages: PagesApi;

  /**
   * Coverage tracking — called by whoever *decides* to place a field, before
   * the visibility `v-if` (a hidden field is still a placed field).
   */
  register(name: string): void;
  unregister(name: string): void;
}

export type ErrorDisplay = "always" | "touched";

/**
 * What a host-registered control receives. The scaffold around it (label
 * omitted — render your own; error list, aria wiring) stays with
 * `DynamicInput`: spread `aria` onto your focusable element and emit
 * `update:input` with the new value.
 */
export interface CustomControlProps {
  field: ValueField;
  input: unknown;
  /** formisch's element bindings (name, ref, event handlers) — spread onto the control. */
  fieldProps: Record<string, unknown>;
  /** aria-invalid / aria-describedby / aria-required, pre-computed. */
  aria: Record<string, string | undefined>;
  /** Host-resolved or static choices, when the field has any. */
  options: readonly Option[];
  loading: boolean;
  disabled: boolean;
  /** Whether the field's host-resolved options or computed value failed to load. */
  loadError: boolean;
}

/** What a {@link SubmitHandler} receives besides the values. */
export interface SubmitContext {
  form: DynamicFormStore;
  /**
   * Maps server-side validation errors onto fields, so they render in place
   * like schema errors. Keys are dotted field names (`"email"`,
   * `"address.city"`); values one message or several. Unknown names are
   * skipped with a warning. The user's next edit revalidates and replaces them.
   */
  setFieldErrors(errors: Record<string, string | readonly string[]>): void;
}

/**
 * The host's submit handler — `DynamicForm`'s `@submit`. Runs only when the
 * schema passed. May be async: the form stays `isSubmitting` until the
 * returned promise settles, so a server roundtrip keeps the button disabled.
 * Report server-side field errors through {@link SubmitContext.setFieldErrors}.
 */
export type SubmitHandler = (values: unknown, context: SubmitContext) => unknown | Promise<unknown>;

/**
 * Every built-in UI string, overridable per form via `DynamicForm`'s `text`
 * prop — the i18n hook. `requiredMessage` is compiled into the schema at
 * mount; changing locale means remounting the form (`:key`).
 */
export interface UiText {
  submit: string;
  submitting: string;
  reset: string;
  loading: string;
  selectPlaceholder: string;
  addRow: string;
  removeRow: string;
  /** Announced while a populate lookup blocks the form. */
  populating: string;
  /** Shown under a field whose host-resolved options or computed value failed to load. */
  loadFailed: string;
  /** Wizard navigation. `stepLabel` interpolates `{current}` and `{total}`. */
  next: string;
  back: string;
  stepLabel: string;
  /** Fallback for required fields that declare no `requiredMessage`. */
  requiredMessage: string;
}

export const DEFAULT_UI_TEXT: UiText = {
  submit: "Submit",
  submitting: "Submitting…",
  reset: "Reset",
  loading: "Loading…",
  selectPlaceholder: "— Select —",
  addRow: "Add",
  removeRow: "Remove",
  populating: "Loading…",
  loadFailed: "Couldn't load — please try again",
  next: "Next",
  back: "Back",
  stepLabel: "Step {current} of {total}",
  requiredMessage: "This field is required",
};

export const FormContextKey: InjectionKey<FormContext> = Symbol("formblatt-form-context");

/** Reaches the enclosing `<DynamicForm>`. Throws when used outside one. */
export function useFormContext(): FormContext {
  const context = inject(FormContextKey, null);
  if (!context) {
    fail("form", "DynamicField / DynamicSection / DynamicLayout must be used inside <DynamicForm>");
  }
  return context;
}
