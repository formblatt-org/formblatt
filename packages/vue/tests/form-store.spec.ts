import { describe, expect, it } from "vitest";
import { reset } from "@formisch/vue";
import type { FormDefinition } from "@formblatt/core";
import { isFormDirty, readDirtyInput, writeInput } from "../src/form-store";
import { settle, withForm } from "./harness";

const definition: FormDefinition = {
  id: "dirty",
  fields: [
    { name: "firstName", kind: "string", required: false, initial: "Ada" },
    { name: "lastName", kind: "string", required: false },
  ],
};

describe("dirty state", () => {
  it("flips on an edit, back off on reset", async () => {
    const { form } = withForm(definition, () => undefined);
    expect(isFormDirty(form)).toBe(false);

    writeInput(form, ["firstName"], "Grace");
    await settle();
    expect(isFormDirty(form)).toBe(true);

    reset(form);
    await settle();
    expect(isFormDirty(form)).toBe(false);
  });

  it("stays clean when a write restores the initial value", async () => {
    const { form } = withForm(definition, () => undefined);

    writeInput(form, ["firstName"], "Grace");
    writeInput(form, ["firstName"], "Ada");
    await settle();

    expect(isFormDirty(form)).toBe(false);
  });

  it("exposes only the changed values as dirty input", async () => {
    const { form } = withForm(definition, () => undefined);

    writeInput(form, ["lastName"], "Lovelace");
    await settle();

    expect(readDirtyInput(form)).toEqual({ lastName: "Lovelace" });
  });
});
