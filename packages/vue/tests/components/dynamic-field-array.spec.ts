import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { FormDefinition } from "@formblatt/core";
import DynamicForm from "../../src/components/DynamicForm.vue";
import DynamicFieldArray from "../../src/components/DynamicFieldArray.vue";
import { settle } from "../harness";

const definition: FormDefinition = {
  id: "array-form",
  fields: [{
    name: "lines", kind: "array",
    item: {
      name: "line", kind: "object",
      fields: [
        { name: "sku", kind: "string", label: "SKU", required: false },
        { name: "qty", kind: "number", control: "number", label: "Qty", required: false },
        {
          name: "meta", kind: "object", fields: [
            { name: "note", kind: "string", label: "Note", required: false },
          ],
        },
      ],
    },
    initial: [
      { sku: "A-1", qty: 1 },
      { sku: "B-2", qty: 2 },
    ],
  }],
};

function mountArray(text?: Record<string, string>) {
  return mount(DynamicForm, {
    props: { definition, ...(text ? { text } : {}) },
    slots: { default: '<DynamicFieldArray name="lines" />' },
    global: { components: { DynamicFieldArray } },
  });
}

describe("DynamicFieldArray", () => {
  it("renders one row per item with a control per leaf, nested objects included", async () => {
    const wrapper = mountArray();
    await settle();

    const rows = wrapper.findAll(".array-item");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.findAll("input")).toHaveLength(3); // sku, qty, meta.note
    expect(rows[0]!.findAll(".field span").map(node => node.text())).toEqual(["SKU", "Qty", "Note"]);
  });

  it("adds and removes rows through the default buttons", async () => {
    const wrapper = mountArray();
    await settle();

    const addButton = wrapper.findAll("button").find(button => button.text() === "Add")!;
    await addButton.trigger("click");
    await settle();
    expect(wrapper.findAll(".array-item")).toHaveLength(3);

    const removeButton = wrapper.findAll("button").find(button => button.text() === "Remove")!;
    await removeButton.trigger("click");
    await settle();
    expect(wrapper.findAll(".array-item")).toHaveLength(2);
  });

  it("renders the configured row-button labels", async () => {
    const wrapper = mountArray({ addRow: "Neue Zeile", removeRow: "Entfernen" });
    await settle();

    const texts = wrapper.findAll("button").map(button => button.text());
    expect(texts).toContain("Neue Zeile");
    expect(texts).toContain("Entfernen");
  });
});
