import type { Component } from "vue";
import CheckboxControl from "../components/controls/CheckboxControl.vue";
import CheckboxGroupControl from "../components/controls/CheckboxGroupControl.vue";
import NumberControl from "../components/controls/NumberControl.vue";
import RadioGroupControl from "../components/controls/RadioGroupControl.vue";
import SelectControl from "../components/controls/SelectControl.vue";
import TextareaControl from "../components/controls/TextareaControl.vue";
import TextControl from "../components/controls/TextControl.vue";

/**
 * The app's control registry — formblatt is headless and renders only what
 * the app registers. Keys are field `control` names, plus the reserved
 * `text` (fields without a `control`) and `multiple` (multi-enums without
 * one). A definition resolving to a missing key is rejected at mount.
 */
export const DEMO_CONTROLS: Record<string, Component> = {
  // TextControl renders the control name as the input `type`
  text: TextControl,
  email: TextControl,
  password: TextControl,
  date: TextControl,
  number: NumberControl,
  checkbox: CheckboxControl,
  select: SelectControl,
  textarea: TextareaControl,
  radio: RadioGroupControl,
  multiple: CheckboxGroupControl,
};
