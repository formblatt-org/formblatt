import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { FormDefinition, PopulateResolver } from "@formblatt/core";
import DynamicForm from "../../src/components/DynamicForm.vue";
import DynamicField from "../../src/components/DynamicField.vue";
import { deferred, settle } from "../harness";

const simple: FormDefinition = {
  id: "form-simple",
  fields: [
    { name: "firstName", kind: "string", label: "First name", required: false },
    { name: "age", kind: "number", control: "number", label: "Age", required: false },
    {
      name: "address", kind: "object", fields: [
        { name: "city", kind: "string", label: "City", required: false },
      ],
    },
  ],
};

describe("DynamicForm rendering", () => {
  it("renders every leaf through the automatic layout, object-nested ones included", () => {
    const wrapper = mount(DynamicForm, { props: { definition: simple } });

    const labels = wrapper.findAll(".field span").map(node => node.text());
    expect(labels).toEqual(["First name", "Age", "City"]);
  });

  it("applies text overrides to the built-in strings", () => {
    const withSelect: FormDefinition = {
      id: "form-text",
      fields: [
        { name: "color", kind: "enum", control: "select", required: false, options: [{ label: "Red", value: "red" }] },
      ],
    };
    const wrapper = mount(DynamicForm, {
      props: {
        definition: withSelect,
        text: { submit: "Absenden", selectPlaceholder: "Bitte wählen" },
      },
    });

    expect(wrapper.find("button[type='submit']").text()).toBe("Absenden");
    expect(wrapper.find("option").text()).toBe("Bitte wählen");
  });
});

describe("DynamicForm submit", () => {
  it("emits the parsed values on a valid submit", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: simple } });

    await wrapper.find("input").setValue("Ada");
    await settle();
    await wrapper.find("form").trigger("submit");
    await settle(5);

    const emitted = wrapper.emitted("submit");
    expect(emitted).toHaveLength(1);
    expect(emitted![0]![0]).toMatchObject({ firstName: "Ada" });
  });

  it("does not emit while a populate lookup is in flight, then works again", async () => {
    const definition: FormDefinition = {
      id: "form-populate",
      fields: [
        { name: "profile", kind: "enum", control: "select", required: false, options: [{ label: "Alice", value: "alice" }] },
        { name: "firstName", kind: "string", required: false },
      ],
      affects: [{ effect: "populate", trigger: ["profile"], source: "lookup" }],
    };
    const pending = deferred<Record<string, unknown>>();
    const resolvePopulate: PopulateResolver = () => pending.promise;

    const wrapper = mount(DynamicForm, { props: { definition, resolvePopulate } });

    await wrapper.find("select").setValue("alice");
    await settle();

    await wrapper.find("form").trigger("submit");
    await settle(5);
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.find("button[type='submit']").attributes("disabled")).toBeDefined();

    pending.release({ firstName: "Alice" });
    await settle(5);

    await wrapper.find("form").trigger("submit");
    await settle(5);
    expect(wrapper.emitted("submit")).toHaveLength(1);
  });

  it("focuses the first invalid control after a failed submit", async () => {
    const strict: FormDefinition = {
      id: "form-strict",
      fields: [
        { name: "firstName", kind: "string", label: "First name" },
        { name: "lastName", kind: "string", label: "Last name", required: false },
      ],
    };
    const wrapper = mount(DynamicForm, {
      props: { definition: strict },
      attachTo: document.body,
    });

    await wrapper.find("form").trigger("submit");
    await settle(6);

    expect(wrapper.emitted("submit")).toBeUndefined();
    const focused = document.activeElement as HTMLInputElement | null;
    expect(focused?.getAttribute("aria-invalid")).toBe("true");

    wrapper.unmount();
  });
});

describe("DynamicForm error display and visibility", () => {
  it("hides errors until a submit is attempted in touched mode", async () => {
    const strict: FormDefinition = {
      id: "form-touched",
      validate: "initial",
      fields: [{ name: "firstName", kind: "string", label: "First name" }],
    };
    const wrapper = mount(DynamicForm, {
      props: { definition: strict, errorDisplay: "touched" },
    });
    await settle();

    expect(wrapper.find(".field-errors").exists()).toBe(false);

    await wrapper.find("form").trigger("submit");
    await settle(5);

    expect(wrapper.find(".field-errors").exists()).toBe(true);
  });

  it("reveals an affect-shown field and its section only while the condition holds", async () => {
    const definition: FormDefinition = {
      id: "form-visibility",
      fields: [
        { name: "toggle", kind: "boolean", control: "checkbox", label: "Toggle", required: false },
        { name: "secret", kind: "string", label: "Secret", required: false },
      ],
      affects: [{ effect: "show", when: { path: ["toggle"], op: "truthy" }, targets: [["secret"]] }],
      layout: [
        { type: "field", name: "toggle" },
        { type: "section", id: "s", title: "Secrets", children: [{ type: "field", name: "secret" }] },
      ],
    };
    const wrapper = mount(DynamicForm, { props: { definition } });
    await settle();

    expect(wrapper.find("details").exists()).toBe(false);

    await wrapper.find("input[type='checkbox']").setValue(true);
    await settle();

    expect(wrapper.find("details").exists()).toBe(true);
    expect(wrapper.findAll(".field span").map(node => node.text())).toContain("Secret");
  });
});

describe("DynamicForm coverage warnings", () => {
  it("warns about fields the custom slot never places", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const definition: FormDefinition = {
      id: "form-coverage",
      fields: [
        { name: "placed", kind: "string", required: false },
        { name: "forgotten", kind: "string", required: false },
      ],
    };

    mount(DynamicForm, {
      props: { definition },
      slots: { default: '<DynamicField name="placed" />' },
      global: { components: { DynamicField } },
    });
    await settle(5);

    const message = warn.mock.calls.map(call => String(call[0])).find(text => text.includes("not placed"));
    expect(message).toContain("forgotten");
    expect(message).not.toContain("placed,");
    warn.mockRestore();
  });
});
