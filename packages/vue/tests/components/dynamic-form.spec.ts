import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { check } from "valibot";
import type { FormDefinition, PopulateResolver } from "@formblatt/core";
import DynamicForm from "../../src/components/DynamicForm.vue";
import DynamicField from "../../src/components/DynamicField.vue";
import { readInput, type DynamicFormStore } from "../../src/form-store";
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

  it("keeps a pristine dependent-options field untouched in touched mode", async () => {
    // regression: the options watcher used to "clear" the dependent field at mount even when
    // already empty — formisch marks every write as touched, surfacing the required error
    const definition: FormDefinition = {
      id: "form-touched-options",
      validate: "initial",
      revalidate: "input",
      fields: [
        {
          name: "size", kind: "enum", control: "radio", label: "Size", requiredMessage: "Pick a size",
          options: [{ label: "S", value: "S" }],
        },
        {
          name: "color", kind: "enum", control: "radio", label: "Color", requiredMessage: "Pick a color",
          optionsSource: { source: "colors", dependsOn: [["size"]] },
        },
      ],
    };
    const wrapper = mount(DynamicForm, {
      props: { definition, errorDisplay: "touched", resolveOptions: () => [] },
    });
    await settle(8);

    expect(wrapper.findAll(".field-errors li")).toHaveLength(0);
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
  it("lets the per-form `controls` prop shadow the app-wide registry", () => {
    const OwnText = defineComponent({
      props: ["field", "fieldProps", "aria"],
      emits: ["update:input"],
      template: `<input class="own-text" v-bind="{ ...fieldProps, ...aria }" />`,
    });
    const wrapper = mount(DynamicForm, {
      props: { definition: simple, controls: { text: OwnText } },
    });

    // firstName and city resolve to "text" — the form's own control wins over the kit's
    expect(wrapper.findAll(".own-text")).toHaveLength(2);
  });

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

describe("DynamicForm multiple enums", () => {
  it("checkbox toggles accumulate into the stored string[] and submit as one", async () => {
    const definition: FormDefinition = {
      id: "form-multi",
      fields: [
        {
          name: "features", kind: "enum", multiple: true, label: "Features", required: false,
          options: [
            { label: "A", value: "a" },
            { label: "B", value: "b" },
            { label: "C", value: "c" },
          ],
        },
      ],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, { props: { definition, onSubmit } });

    // two separate clicks — the second must EXTEND the selection, not replace it
    const boxes = wrapper.findAll("input[type='checkbox']");
    await boxes[0]!.setValue(true);
    await settle();
    await boxes[2]!.setValue(true);
    await settle();

    await wrapper.find("form").trigger("submit");
    await settle(5);

    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ features: ["a", "c"] });
  });
});

describe("DynamicForm transient fields", () => {
  it("delivers submit values without the transient fields", async () => {
    const definition: FormDefinition = {
      id: "form-transient",
      fields: [
        { name: "size", kind: "string", required: false, initial: "M" },
        {
          name: "hex", kind: "string", required: false, hidden: true, transient: true,
          computed: { expression: { op: "lookup", on: { ref: ["size"] }, table: { M: "#1d4ed8" } } },
        },
      ],
    };
    const onSubmit = vi.fn();
    const wrapper = mount(DynamicForm, { props: { definition, onSubmit } });
    await settle();

    const form = (wrapper.vm as unknown as { form: DynamicFormStore }).form;
    // the store still holds it — the page can render from it
    expect(readInput(form, ["hex"])).toBe("#1d4ed8");

    await wrapper.find("form").trigger("submit");
    await settle(5);

    // ...but the parsed values do not
    expect(onSubmit.mock.calls[0]![0]).toEqual({ size: "M" });
  });
});

describe("DynamicForm composed interactions", () => {
  // the product-page pattern: cascading options feed a computed field
  it("recomputes and reconciles when a cascade dependency changes", async () => {
    const definition: FormDefinition = {
      id: "form-variant",
      validate: "initial",
      revalidate: "input",
      fields: [
        {
          name: "size", kind: "enum", control: "radio", label: "Size",
          options: [{ label: "S", value: "S" }, { label: "M", value: "M" }],
        },
        { name: "color", kind: "enum", control: "radio", label: "Color", optionsSource: { source: "colors", dependsOn: [["size"]] } },
        {
          name: "sku", kind: "string", required: false, hidden: true,
          computed: {
            expression: {
              if: { and: [{ path: ["size"], op: "notEmpty" }, { path: ["color"], op: "notEmpty" }] },
              then: { op: "concat", sep: "-", args: [{ const: "TS" }, { ref: ["size"] }, { ref: ["color"] }] },
              else: { const: "" },
            },
          },
        },
      ],
    };
    const colorsBySize: Record<string, string[]> = { S: ["BLK"], M: ["BLK", "OCN"] };
    const resolveOptions = (_source: string, { deps }: { deps: Record<string, unknown> }) =>
      (colorsBySize[deps.size as string] ?? []).map(value => ({ label: value, value }));

    const wrapper = mount(DynamicForm, { props: { definition, resolveOptions } });
    await settle();
    const form = (wrapper.vm as unknown as { form: DynamicFormStore }).form;

    // pick M → colors load → pick OCN → the sku computes
    // (trigger change directly: happy-dom's selector parser trips over formisch's ["size"] input names on .checked writes)
    await wrapper.find("input[type='radio'][value='M']").trigger("change");
    await settle();
    await wrapper.find("input[type='radio'][value='OCN']").trigger("change");
    await settle();
    expect(readInput(form, ["sku"])).toBe("TS-M-OCN");

    // switch to S — OCN is not offered there: the color reconciles away, the sku empties, the form invalidates
    await wrapper.find("input[type='radio'][value='S']").trigger("change");
    await settle(6);
    expect(readInput(form, ["color"])).toBeUndefined();
    expect(readInput(form, ["sku"])).toBe("");
    expect(form.isValid).toBe(false);
  });
});

describe("DynamicForm definition reactivity", () => {
  it("warns in dev when the definition prop changes without a remount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapper = mount(DynamicForm, { props: { definition: simple } });

    await wrapper.setProps({ definition: { ...simple, id: "form-simple-v2" } });
    await settle();

    const message = warn.mock.calls.map(call => String(call[0])).find(text => text.includes("remount"));
    expect(message).toBeDefined();
    warn.mockRestore();
  });
});

describe("DynamicForm invalid definitions", () => {
  // an affect targeting a nonexistent field is a lint ERROR — validateDefinition rejects it
  const broken: FormDefinition = {
    id: "form-broken",
    fields: [{ name: "email", kind: "string", required: false }],
    affects: [{ effect: "show", when: { path: ["email"], op: "notEmpty" }, targets: [["ghost"]] }],
  };

  it("renders the error state instead of throwing, and emits the error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mount(DynamicForm, { props: { definition: broken } });

    expect(wrapper.find(".definition-error").exists()).toBe(true);
    expect(wrapper.find("form").exists()).toBe(false);

    const emitted = wrapper.emitted("error");
    expect(emitted).toHaveLength(1);
    expect((emitted![0]![0] as Error).message).toContain("ghost");
    error.mockRestore();
  });

  it("renders a custom error slot with the error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mount(DynamicForm, {
      props: { definition: broken },
      slots: { error: '<template #error="{ error }"><p class="custom-error">{{ error.message }}</p></template>' },
    });

    expect(wrapper.find(".custom-error").text()).toContain("ghost");
    error.mockRestore();
  });

  it("rejects a definition whose control has no registered component", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const definition: FormDefinition = {
      id: "form-unregistered-control",
      fields: [{ name: "score", kind: "number", control: "rating", required: false }],
    };

    // the kit has no "rating" — the whole form errors instead of leaving a field hole
    const wrapper = mount(DynamicForm, { props: { definition } });

    expect(wrapper.find(".definition-error").exists()).toBe(true);
    expect(wrapper.find("form").exists()).toBe(false);
    expect((wrapper.emitted("error")![0]![0] as Error).message).toContain('control "rating" is not registered');
    error.mockRestore();
  });

  it("survives a definition that is not even an object", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mount(DynamicForm, {
      props: { definition: null as unknown as FormDefinition },
    });

    expect(wrapper.find(".definition-error").exists()).toBe(true);
    error.mockRestore();
  });
});

describe("DynamicForm resolver failures", () => {
  it("shows the load-failed line under a field whose options resolver rejects", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const definition: FormDefinition = {
      id: "form-options-error",
      fields: [
        { name: "country", kind: "enum", control: "select", required: false, optionsSource: { source: "countries" } },
      ],
    };
    const wrapper = mount(DynamicForm, {
      props: { definition, resolveOptions: () => Promise.reject(new Error("service down")) },
    });
    await settle(5);

    expect(wrapper.find(".field-load-error").text()).toContain("Couldn't load");
    error.mockRestore();
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
