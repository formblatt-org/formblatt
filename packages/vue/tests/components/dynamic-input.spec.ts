import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { ValueField } from "@formblatt/core";
import type { FieldElementProps } from "@formisch/vue";
import DynamicInput from "../../src/components/DynamicInput.vue";

const fieldProps: FieldElementProps = {
  name: "x",
  autofocus: false,
  ref: () => {},
  onFocus: () => {},
  onChange: () => {},
  onBlur: () => {},
};

function mountInput(field: Partial<ValueField> & Pick<ValueField, "kind">, extra: Record<string, unknown> = {}) {
  return mount(DynamicInput, {
    props: {
      field: { name: "x", label: "X", ...field } as ValueField,
      input: undefined,
      fieldProps,
      errors: null,
      ...extra,
    },
  });
}

/** the LAST emitted update:input payload */
const lastInput = (wrapper: ReturnType<typeof mountInput>) =>
  wrapper.emitted("update:input")?.at(-1)?.[0];

describe("DynamicInput value normalization", () => {
  it("stores a typed number, and undefined for an emptied number input", async () => {
    const wrapper = mountInput({ kind: "number", control: "number" });

    await wrapper.find("input").setValue("42");
    expect(lastInput(wrapper)).toBe(42);

    await wrapper.find("input").setValue("");
    expect(lastInput(wrapper)).toBeUndefined();
  });

  it("stores undefined for the select placeholder, the value otherwise", async () => {
    const wrapper = mountInput({
      kind: "enum", control: "select",
      options: [{ label: "Red", value: "red" }],
    });

    await wrapper.find("select").setValue("red");
    expect(lastInput(wrapper)).toBe("red");

    await wrapper.find("select").setValue("");
    expect(lastInput(wrapper)).toBeUndefined();
  });

  it("renders a multiple enum as a checkbox group and toggles values in option order", async () => {
    const options = [
      { label: "A", value: "a" },
      { label: "B", value: "b" },
      { label: "C", value: "c" },
    ];
    const wrapper = mountInput({ kind: "enum", multiple: true, control: "select", options });

    // no ctrl+click UI: a multi-enum must not render a <select multiple>
    expect(wrapper.find("select").exists()).toBe(false);
    const boxes = wrapper.findAll("input[type='checkbox']");
    expect(boxes).toHaveLength(3);

    await boxes[2]!.setValue(true);
    expect(lastInput(wrapper)).toEqual(["c"]);

    // the parent writes the value back; checking another box extends it — in option order, not click order
    await wrapper.setProps({ input: ["c"] });
    await boxes[0]!.setValue(true);
    expect(lastInput(wrapper)).toEqual(["a", "c"]);

    await wrapper.setProps({ input: ["a", "c"] });
    await boxes[2]!.setValue(false);
    expect(lastInput(wrapper)).toEqual(["a"]);
  });

  it("renders control: textarea as a real <textarea>, not <input type='textarea'>", async () => {
    const wrapper = mountInput({ kind: "string", control: "textarea" });

    expect(wrapper.find("textarea").exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);

    await wrapper.find("textarea").setValue("multi\nline");
    expect(lastInput(wrapper)).toBe("multi\nline");
  });

  it("emits the checkbox state as a boolean", async () => {
    const wrapper = mountInput({ kind: "boolean", control: "checkbox" });

    await wrapper.find("input").setValue(true);
    expect(lastInput(wrapper)).toBe(true);
  });

  it("renders a radio group and emits the picked option", async () => {
    const wrapper = mountInput({
      kind: "enum", control: "radio",
      options: [{ label: "Red", value: "red" }, { label: "Blue", value: "blue" }],
    }, { input: "blue" });

    const radios = wrapper.findAll("input[type='radio']");
    expect(radios).toHaveLength(2);
    expect(wrapper.find("fieldset[role='radiogroup'] legend").text()).toBe("X");
    expect((radios[1]!.element as HTMLInputElement).checked).toBe(true);

    await radios[0]!.setValue(true);
    expect(lastInput(wrapper)).toBe("red");
  });

});

describe("DynamicInput accessibility contract", () => {
  it("links its errors: aria-invalid, aria-describedby onto the control, role=alert on the list", () => {
    const wrapper = mountInput({ kind: "string" }, { errors: ["Required", "Too short"] });

    const input = wrapper.find("input");
    const list = wrapper.find("ul[role='alert']");

    expect(list.exists()).toBe(true);
    expect(list.findAll("li")).toHaveLength(2);
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(input.attributes("aria-describedby")).toBe(list.attributes("id"));
  });

  it("carries no error aria while valid", () => {
    const wrapper = mountInput({ kind: "string" });
    const input = wrapper.find("input");

    expect(input.attributes("aria-invalid")).toBeUndefined();
    expect(input.attributes("aria-describedby")).toBeUndefined();
  });

  it("announces required-ness, except for optional / disabled / computed fields", () => {
    expect(mountInput({ kind: "string" }).find("input").attributes("aria-required")).toBe("true");
    expect(mountInput({ kind: "string", required: false }).find("input").attributes("aria-required")).toBeUndefined();
    expect(mountInput({ kind: "string", disabled: true }).find("input").attributes("aria-required")).toBeUndefined();
    expect(mountInput({ kind: "string", computed: { expression: { const: "x" } } })
      .find("input").attributes("aria-required")).toBeUndefined();
  });

  it("falls back to English UI text outside a DynamicForm", () => {
    const wrapper = mountInput({
      kind: "enum", control: "select",
      options: [{ label: "Red", value: "red" }],
    });
    expect(wrapper.find("option").text()).toBe("— Select —");
  });
});
