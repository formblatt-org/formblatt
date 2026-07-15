import { describe, expect, it } from "vitest";
import type { FormDefinition } from "@formblatt/core";
import { useAffects } from "../src/composables/useAffects";
import { readInput, writeInput } from "../src/form-store";
import { settle, withForm } from "./harness";

const definition: FormDefinition = {
  id: "affects",
  fields: [
    { name: "sameAsShipping", kind: "boolean", required: false, initial: false },
    { name: "billingCity", kind: "string", initial: "Berlin" },
    { name: "note", kind: "string", required: false, initial: "kept" },
    { name: "internalId", kind: "string", required: false, hidden: true },
  ],
  affects: [
    {
      effect: "show",
      when: { path: ["sameAsShipping"], op: "truthy" },
      targets: [["internalId"]],
    },
    {
      effect: "hideAndClear",
      when: { path: ["sameAsShipping"], op: "truthy" },
      targets: [["billingCity"]],
    },
    {
      effect: "hide",
      when: { path: ["sameAsShipping"], op: "truthy" },
      targets: [["note"]],
    },
  ],
};

describe("useAffects", () => {
  it("reports visibility from the compiled rules", async () => {
    const { form, result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["billingCity"])).toBe(true);

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(result.isVisible(["billingCity"])).toBe(false);
  });

  it("treats a field with no rules as always visible", () => {
    const { result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["sameAsShipping"])).toBe(true);
  });

  it("treats a statically hidden field as never visible", () => {
    const { result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["internalId"])).toBe(false);
  });

  it("keeps a hidden field invisible even when a show affect's condition holds", async () => {
    const { form, result } = withForm(definition, form => useAffects(form, definition));

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(result.isVisible(["internalId"])).toBe(false);
  });

  it("clears a hideAndClear target's value when it hides", async () => {
    const { form } = withForm(definition, form => useAffects(form, definition));
    expect(readInput(form, ["billingCity"])).toBe("Berlin");

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(readInput(form, ["billingCity"])).toBeUndefined();
  });

  it("leaves a plain hide target's value alone — only hideAndClear clears", async () => {
    const { form } = withForm(definition, form => useAffects(form, definition));

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(readInput(form, ["note"])).toBe("kept");
  });
});
