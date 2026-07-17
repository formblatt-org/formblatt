import type { Option, ValueField } from "@formblatt/core";
import type { UiText } from "../form-context";
import type { FieldBindings } from "../form-store";

/**
 * The uniform contract of a built-in control — the internal mirror of
 * `CustomControlProps`. `DynamicInput` owns the scaffold (label, error list,
 * aria computation) and hands every registry entry the same props; a control
 * spreads `{ ...fieldProps, ...aria }` onto its focusable element and emits
 * `update:input` with the normalized value.
 */
export interface BuiltInControlProps {
  field: ValueField;
  input: unknown;
  /** The field's element bindings (name, ref, event handlers). */
  fieldProps: FieldBindings;
  /** aria-invalid / aria-describedby / aria-required, pre-computed by the scaffold. */
  aria: Record<string, string | undefined>;
  /** Host-resolved or static choices — empty for non-enum controls. */
  choices: readonly Option[];
  disabled: boolean;
  loading: boolean;
  /** The form's UI strings (select placeholder, loading …). */
  text: UiText;
}
