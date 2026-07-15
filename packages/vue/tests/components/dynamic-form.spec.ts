import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { check } from "valibot";
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

  it("hydrates controls from initialData, merged over definition initials", async () => {
    const withInitial: FormDefinition = {
      ...simple,
      id: "form-hydrated",
      fields: [
        { name: "firstName", kind: "string", label: "First name", required: false, initial: "Declared" },
        ...simple.fields.slice(1),
      ],
    };
    const wrapper = mount(DynamicForm, {
      props: {
        definition: withInitial,
        initialData: { firstName: "Saved", address: { city: "Berlin" } },
      },
    });
    await settle();

    const inputs = wrapper.findAll("input");
    expect((inputs[0]!.element as HTMLInputElement).value).toBe("Saved");
    expect((inputs[2]!.element as HTMLInputElement).value).toBe("Berlin");
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
  it("calls the handler with the parsed values on a valid submit", async () => {
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, { props: { definition: simple, onSubmit } });

    await wrapper.find("input").setValue("Ada");
    await settle();
    await wrapper.find("form").trigger("submit");
    await settle(5);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ firstName: "Ada" });
  });

  it("stays isSubmitting while an async handler is pending", async () => {
    const pending = deferred<void>();
    const onSubmit = vi.fn(() => pending.promise);
    const wrapper = mount(DynamicForm, { props: { definition: simple, onSubmit } });

    await wrapper.find("form").trigger("submit");
    await settle(5);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(wrapper.find("button[type='submit']").attributes("disabled")).toBeDefined();

    pending.release();
    await settle(5);
    expect(wrapper.find("button[type='submit']").attributes("disabled")).toBeUndefined();
  });

  it("maps server-side errors onto fields through the submit context", async () => {
    const wrapper = mount(DynamicForm, {
      props: {
        definition: simple,
        onSubmit: (_values, { setFieldErrors }) =>
          setFieldErrors({ firstName: "Already taken", "address.city": ["Unknown city"] }),
      },
    });

    await wrapper.find("form").trigger("submit");
    await settle(5);

    const errors = wrapper.findAll(".field-errors li").map(node => node.text());
    expect(errors).toEqual(["Already taken", "Unknown city"]);
    expect(wrapper.find("input").attributes("aria-invalid")).toBe("true");

    // the user's next edit revalidates and replaces the server error
    await wrapper.find("input").setValue("Fresh");
    await settle(5);
    expect(wrapper.findAll(".field-errors li").map(node => node.text())).not.toContain("Already taken");
  });

  it("does not submit while a populate lookup is in flight, then works again", async () => {
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
    const onSubmit = vi.fn();

    const wrapper = mount(DynamicForm, { props: { definition, resolvePopulate, onSubmit } });

    await wrapper.find("select").setValue("alice");
    await settle();

    await wrapper.find("form").trigger("submit");
    await settle(5);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(wrapper.find("button[type='submit']").attributes("disabled")).toBeDefined();

    pending.release({ firstName: "Alice" });
    await settle(5);

    await wrapper.find("form").trigger("submit");
    await settle(5);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("runs remote validation through the resolver and blocks an invalid submit", async () => {
    const definition: FormDefinition = {
      id: "form-remote",
      fields: [
        { name: "username", kind: "string", validations: [{ type: "remote", value: "usernameFree", message: "Taken" }] },
      ],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, {
      props: {
        definition,
        onSubmit,
        resolveValidation: async (_source, value) => value !== "ada",
      },
    });

    await wrapper.find("input").setValue("ada");
    await wrapper.find("form").trigger("submit");
    await settle(6);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(wrapper.find(".field-errors").text()).toContain("Taken");

    await wrapper.find("input").setValue("grace");
    await wrapper.find("form").trigger("submit");
    await settle(6);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("accepts and applies host-registered validation rules", async () => {
    const definition: FormDefinition = {
      id: "form-custom-rule",
      fields: [
        { name: "plate", kind: "string", validations: [{ type: "licensePlate", message: "Not a plate" }] },
      ],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, {
      props: {
        definition,
        onSubmit,
        // also proves the lint accepts the custom type — validateDefinition would throw otherwise
        rules: { licensePlate: rule => check(value => /^[A-Z]+-\d+$/.test(String(value)), rule.message) },
      },
    });

    await wrapper.find("input").setValue("nope");
    await wrapper.find("form").trigger("submit");
    await settle(5);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(wrapper.find(".field-errors").text()).toContain("Not a plate");
  });

  it("focuses the first invalid control after a failed submit", async () => {
    const strict: FormDefinition = {
      id: "form-strict",
      fields: [
        { name: "firstName", kind: "string", label: "First name" },
        { name: "lastName", kind: "string", label: "Last name", required: false },
      ],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, {
      props: { definition: strict, onSubmit },
      attachTo: document.body,
    });

    await wrapper.find("form").trigger("submit");
    await settle(6);

    expect(onSubmit).not.toHaveBeenCalled();
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

describe("DynamicForm custom controls", () => {
  it("renders a registered control inside the scaffold and writes its value", async () => {
    const Rating = defineComponent({
      props: ["field", "input", "aria"],
      emits: ["update:input"],
      template: `<button type="button" class="rating" v-bind="aria" @click="$emit('update:input', 5)">rate</button>`,
    });
    const definition: FormDefinition = {
      id: "form-controls",
      fields: [{ name: "score", kind: "number", control: "rating", required: false }],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, {
      props: { definition, onSubmit, controls: { rating: Rating } },
    });

    await wrapper.find("button.rating").trigger("click");
    await settle();
    await wrapper.find("form").trigger("submit");
    await settle(5);

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ score: 5 });
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
