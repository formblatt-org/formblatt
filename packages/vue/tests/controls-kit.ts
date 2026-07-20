import { defineComponent, h, mergeProps, type Component, type PropType, type VNodeChild } from "vue";
import type { Option, ValueField } from "@formblatt/core";
import type { UiText } from "../src/form-context";
import type { FieldBindings } from "../src/form-store";

/**
 * The control kit the component specs register — the package is headless, so
 * tests provide what an app would: plain native controls implementing the
 * {@link ControlProps} contract (own label, `{ ...fieldProps, ...aria }`
 * spread, normalized `update:input` values).
 */

/** Every kit control declares the full contract; specs assert prop wiring through it. */
const contractProps = {
  field: { type: Object as PropType<ValueField>, required: true as const },
  input: { type: null as unknown as PropType<unknown>, required: false as const },
  fieldProps: { type: Object as PropType<FieldBindings>, required: true as const },
  aria: { type: Object as PropType<Record<string, string | undefined>>, required: true as const },
  options: { type: Array as PropType<readonly Option[]>, required: true as const },
  disabled: Boolean,
  loading: Boolean,
  loadError: Boolean,
  text: { type: Object as PropType<UiText>, required: true as const },
};

/** `<label><span>…</span><control/></label>` — the shape the spec selectors read (`.field span`). */
const labeled = (field: ValueField, control: VNodeChild) =>
  h("label", [field.label ? h("span", field.label) : null, control]);

/** Renders the field's `control` name as the input `type` (text, email, date …). */
const TextInput = defineComponent({
  name: "KitTextInput",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => labeled(props.field, h("input", mergeProps({ ...props.fieldProps }, props.aria, {
      type: props.field.control ?? "text",
      disabled: props.disabled,
      value: props.input == null ? "" : String(props.input),
      onInput: (event: Event) => emit("update:input", (event.target as HTMLInputElement).value),
    })));
  },
});

/** An emptied number input stores `undefined`, not `NaN`. */
const NumberInput = defineComponent({
  name: "KitNumberInput",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => labeled(props.field, h("input", mergeProps({ ...props.fieldProps }, props.aria, {
      type: "number",
      disabled: props.disabled,
      value: props.input as number | undefined,
      onInput: (event: Event) => {
        const value = (event.target as HTMLInputElement).valueAsNumber;
        emit("update:input", Number.isNaN(value) ? undefined : value);
      },
    })));
  },
});

const CheckboxInput = defineComponent({
  name: "KitCheckboxInput",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => labeled(props.field, h("input", mergeProps({ ...props.fieldProps }, props.aria, {
      type: "checkbox",
      disabled: props.disabled,
      checked: !!props.input,
      onChange: (event: Event) => emit("update:input", (event.target as HTMLInputElement).checked),
    })));
  },
});

/** The placeholder option stores `undefined` — "no selection" is not a value. */
const SelectInput = defineComponent({
  name: "KitSelectInput",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => labeled(props.field, h("select", mergeProps({ ...props.fieldProps }, props.aria, {
      disabled: props.disabled,
      value: props.input ?? "",
      onChange: (event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        emit("update:input", value === "" ? undefined : value);
      },
    }), [
      h("option", { value: "" }, props.loading ? props.text.loading : props.text.selectPlaceholder),
      ...props.options.map(choice => h("option", { key: choice.value, value: choice.value }, choice.label)),
    ]));
  },
});

const TextareaInput = defineComponent({
  name: "KitTextareaInput",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => labeled(props.field, h("textarea", mergeProps({ ...props.fieldProps }, props.aria, {
      disabled: props.disabled,
      value: props.input as string | undefined,
      onInput: (event: Event) => emit("update:input", (event.target as HTMLTextAreaElement).value),
    })));
  },
});

/** Radios label each option, so the group is a fieldset with a legend. */
const RadioGroup = defineComponent({
  name: "KitRadioGroup",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    return () => h("fieldset", mergeProps({ role: "radiogroup" }, props.aria), [
      props.field.label ? h("legend", props.field.label) : null,
      ...props.options.map(choice => h("label", { key: choice.value }, [
        h("input", {
          type: "radio",
          name: props.fieldProps.name,
          value: choice.value,
          checked: props.input === choice.value,
          disabled: props.disabled,
          onChange: () => emit("update:input", choice.value),
          onBlur: props.fieldProps.onBlur,
        }),
        h("span", choice.label),
      ])),
    ]);
  },
});

/** The stored `string[]` is rebuilt in option order — click order must not leak into the value. */
const CheckboxGroup = defineComponent({
  name: "KitCheckboxGroup",
  props: contractProps,
  emits: ["update:input"],
  setup(props, { emit }) {
    const selected = () => new Set(Array.isArray(props.input) ? (props.input as string[]) : []);
    const toggle = (value: string, event: Event) => {
      const next = selected();
      if ((event.target as HTMLInputElement).checked) next.add(value);
      else next.delete(value);
      emit("update:input", props.options.filter(choice => next.has(choice.value)).map(choice => choice.value));
    };
    return () => h("fieldset", mergeProps({}, props.aria), [
      props.field.label ? h("legend", props.field.label) : null,
      ...props.options.map(choice => h("label", { key: choice.value }, [
        h("input", {
          type: "checkbox",
          name: props.fieldProps.name,
          value: choice.value,
          checked: selected().has(choice.value),
          disabled: props.disabled,
          onChange: (event: Event) => toggle(choice.value, event),
          onBlur: props.fieldProps.onBlur,
        }),
        h("span", choice.label),
      ])),
    ]);
  },
});

/** What an app registers: named controls plus the reserved `text` and `multiple` keys. */
export const TEST_CONTROLS: Record<string, Component> = {
  text: TextInput,
  email: TextInput,
  password: TextInput,
  date: TextInput,
  number: NumberInput,
  checkbox: CheckboxInput,
  select: SelectInput,
  textarea: TextareaInput,
  radio: RadioGroup,
  multiple: CheckboxGroup,
};
