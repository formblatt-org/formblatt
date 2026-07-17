import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { FormDefinition } from "@formblatt/core";
import DynamicForm from "../../src/components/DynamicForm.vue";
import { writeInput, type DynamicFormStore } from "../../src/form-store";
import { settle } from "../harness";

const wizard: FormDefinition = {
  id: "wizard",
  fields: [
    { name: "firstName", kind: "string", label: "First name" },
    { name: "company", kind: "string", label: "Company", required: false },
    { name: "vatId", kind: "string", label: "VAT id", required: false },
    { name: "notes", kind: "string", label: "Notes", required: false },
  ],
  affects: [],
  layout: [
    { type: "page", id: "who", title: "Who", children: [{ type: "field", name: "firstName" }] },
    {
      type: "page", id: "biz", title: "Business", visibleWhen: { path: ["firstName"], op: "eq", value: "Ada" },
      children: [{ type: "field", name: "company" }, { type: "field", name: "vatId" }],
    },
    { type: "page", id: "rest", title: "Rest", children: [{ type: "field", name: "notes" }] },
  ],
};

const labelsOf = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll(".field span").map(node => node.text());

describe("DynamicForm wizard", () => {
  it("renders only the current page, with step indicator and title", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: wizard } });
    await settle();

    expect(labelsOf(wrapper)).toEqual(["First name"]);
    expect(wrapper.find(".page-title").text()).toBe("Who");
    expect(wrapper.find(".step-indicator").text()).toBe("Step 1 of 2"); // "biz" hidden while firstName ≠ Ada
    expect(wrapper.find("button[type='submit']").exists()).toBe(false);
  });

  it("blocks Next while the current page is invalid, then advances", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: wizard } });
    await settle();

    const next = wrapper.findAll("button").find(button => button.text() === "Next")!;
    await next.trigger("click");
    await settle(5);

    expect(labelsOf(wrapper)).toEqual(["First name"]); // still on page 1
    expect(wrapper.find(".field-errors").exists()).toBe(true);

    await wrapper.find("input").setValue("Grace");
    await settle();
    await next.trigger("click");
    await settle(5);

    expect(labelsOf(wrapper)).toEqual(["Notes"]); // the hidden "biz" page was skipped
    expect(wrapper.find(".page-title").text()).toBe("Rest");
  });

  it("includes a page in the step order once its visibleWhen holds", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: wizard } });
    await settle();

    await wrapper.find("input").setValue("Ada");
    await settle();
    expect(wrapper.find(".step-indicator").text()).toBe("Step 1 of 3");

    const next = wrapper.findAll("button").find(button => button.text() === "Next")!;
    await next.trigger("click");
    await settle(5);

    expect(wrapper.find(".page-title").text()).toBe("Business");
    expect(labelsOf(wrapper)).toEqual(["Company", "VAT id"]);
  });

  it("navigates back and shows submit only on the last step", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: wizard } });
    await settle();
    await wrapper.find("input").setValue("Grace");
    await settle();

    await wrapper.findAll("button").find(button => button.text() === "Next")!.trigger("click");
    await settle(5);

    expect(wrapper.find("button[type='submit']").exists()).toBe(true);
    expect(wrapper.findAll("button").some(button => button.text() === "Next")).toBe(false);

    await wrapper.findAll("button").find(button => button.text() === "Back")!.trigger("click");
    await settle();
    expect(wrapper.find(".page-title").text()).toBe("Who");
  });

  // the current page is tracked by id: positions shifting under the user must not move them
  it("stays on the current page when an EARLIER page's condition flips off", async () => {
    const shifting: FormDefinition = {
      id: "wizard-shifting",
      fields: [
        { name: "hasIntro", kind: "boolean", control: "checkbox", required: false, initial: true },
        { name: "intro", kind: "string", required: false, label: "Intro note" },
        { name: "details", kind: "string", required: false, label: "Details" },
        { name: "confirmed", kind: "string", required: false, label: "Confirmed" },
      ],
      layout: [
        { type: "page", id: "intro", title: "Intro", visibleWhen: { path: ["hasIntro"], op: "truthy" }, children: [{ type: "field", name: "intro" }] },
        { type: "page", id: "details", title: "Details", children: [{ type: "field", name: "details" }] },
        { type: "page", id: "confirm", title: "Confirm", children: [{ type: "field", name: "confirmed" }, { type: "field", name: "hasIntro" }] },
      ],
    };
    const wrapper = mount(DynamicForm, { props: { definition: shifting } });
    await settle();

    await wrapper.findAll("button").find(button => button.text() === "Next")!.trigger("click");
    await settle(5);
    expect(wrapper.find(".page-title").text()).toBe("Details");

    // the intro page leaves the step order — an index-based wizard would land on "Confirm"
    const form = (wrapper.vm as unknown as { form: DynamicFormStore }).form;
    writeInput(form, ["hasIntro"], false);
    await settle();

    expect(wrapper.find(".page-title").text()).toBe("Details");
    expect(wrapper.find(".step-indicator").text()).toBe("Step 1 of 2");
  });

  it("returns to the nearest previous page when the CURRENT page's condition flips off", async () => {
    const wrapper = mount(DynamicForm, { props: { definition: wizard } });
    await settle();
    await wrapper.find("input").setValue("Ada");
    await settle();

    await wrapper.findAll("button").find(button => button.text() === "Next")!.trigger("click");
    await settle(5);
    expect(wrapper.find(".page-title").text()).toBe("Business");

    const form = (wrapper.vm as unknown as { form: DynamicFormStore }).form;
    writeInput(form, ["firstName"], "Grace"); // the Business page's condition no longer holds
    await settle();

    expect(wrapper.find(".page-title").text()).toBe("Who");
  });

  it("does not warn about fields living on later pages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount(DynamicForm, { props: { definition: wizard } });
    await settle(5);

    const unplaced = warn.mock.calls.map(call => String(call[0])).find(text => text.includes("not placed"));
    expect(unplaced).toBeUndefined();
    warn.mockRestore();
  });
});
