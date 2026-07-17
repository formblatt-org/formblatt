import type { Component } from "vue";
import CheckboxControl from "./CheckboxControl.vue";
import CheckboxGroupControl from "./CheckboxGroupControl.vue";
import NumberControl from "./NumberControl.vue";
import RadioGroupControl from "./RadioGroupControl.vue";
import SelectControl from "./SelectControl.vue";
import TextareaControl from "./TextareaControl.vue";
import TextControl from "./TextControl.vue";

/** One built-in control the scaffold can render. */
export interface ControlEntry {
  component: Component;
  /** Renders its own fieldset + legend — the scaffold must not wrap it in a label. */
  group?: boolean;
  /** Renders its own loading indicator — the scaffold's label spinner stays off. */
  ownLoadingIndicator?: boolean;
}

/**
 * Built-in controls by `control` name. Names absent here (text, email,
 * password, date, anything unregistered) fall through to
 * {@link GENERIC_CONTROL}, which renders the name as its input `type`.
 * Adding a built-in control means adding an entry — the scaffold in
 * `DynamicInput` does not change.
 */
export const BUILT_IN_CONTROL_ENTRIES: Readonly<Record<string, ControlEntry>> = {
  select: { component: SelectControl, ownLoadingIndicator: true },
  checkbox: { component: CheckboxControl },
  number: { component: NumberControl },
  textarea: { component: TextareaControl },
  radio: { component: RadioGroupControl, group: true },
};

/** The generic input every unmatched control name renders through. */
export const GENERIC_CONTROL: ControlEntry = { component: TextControl };

/** What a `multiple` enum renders as, regardless of its `control` (radio excepted — it wins). */
export const MULTIPLE_CONTROL: ControlEntry = { component: CheckboxGroupControl, group: true };
