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
    { name: "auditRef", kind: "string", required: false, hidden: true },
    { name: "secretCity", kind: "string", required: false, hidden: true, initial: "kept-secret" },
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
      targets: [["billingCity"], ["secretCity"]],
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

  it("treats a hidden field no affect targets as never visible", () => {
    const { result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["auditRef"])).toBe(false);
  });

  it("lets a show affect reveal a hidden field", async () => {
    const { form, result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["internalId"])).toBe(false);

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(result.isVisible(["internalId"])).toBe(true);
  });

  it("never reveals a hidden field through a hide affect", async () => {
    const { form, result } = withForm(definition, form => useAffects(form, definition));
    expect(result.isVisible(["secretCity"])).toBe(false);

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(result.isVisible(["secretCity"])).toBe(false);
  });

  it("clears a hidden hideAndClear target only when its rule triggers, not for being hidden", async () => {
    const { form } = withForm(definition, form => useAffects(form, definition));
    await settle();
    expect(readInput(form, ["secretCity"])).toBe("kept-secret");

    writeInput(form, ["sameAsShipping"], true);
    await settle();

    expect(readInput(form, ["secretCity"])).toBeUndefined();
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
