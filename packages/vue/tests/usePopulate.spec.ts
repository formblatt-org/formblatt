import { describe, expect, it, vi } from "vitest";
import type { FormDefinition, PopulateResolver } from "@formblatt/core";
import { usePopulate } from "../src/composables/usePopulate";
import { readInput, writeInput } from "../src/form-store";
import { deferred, settle, withForm } from "./harness";

const definition: FormDefinition = {
  id: "populate",
  fields: [
    {
      name: "profile", kind: "enum", required: false,
      options: [{ label: "Alice", value: "alice" }, { label: "Bob", value: "bob" }],
    },
    { name: "firstName", kind: "string", required: false, initial: "" },
    { name: "lastName", kind: "string", required: false },
    { name: "role", kind: "string", required: false },
  ],
  affects: [
    {
      effect: "populate",
      trigger: ["profile"],
      source: "profileLookup",
      allow: ["firstName", "lastName"],
    },
  ],
};

const profiles: Record<string, Record<string, unknown>> = {
  alice: { firstName: "Alice", lastName: "Doe", role: "admin" },
  bob: { firstName: "Bob", lastName: "Roe", role: "admin" },
};

const resolveProfile: PopulateResolver = (_source, value) => profiles[value as string] ?? [];

describe("usePopulate", () => {
  it("writes the resolver's entries when the trigger takes a value", async () => {
    const { form } = withForm(definition, form => usePopulate(form, definition, resolveProfile));

    writeInput(form, ["profile"], "alice");
    await settle();

    expect(readInput(form, ["firstName"])).toBe("Alice");
    expect(readInput(form, ["lastName"])).toBe("Doe");
  });

  it("refuses to write a field the allow list excludes", async () => {
    const { form } = withForm(definition, form => usePopulate(form, definition, resolveProfile));

    writeInput(form, ["profile"], "alice");
    await settle();

    expect(readInput(form, ["role"])).toBeUndefined();
  });

  it("normalises a single entry and an entry list, not just a record", async () => {
    const single: PopulateResolver = () => ({ name: "firstName", value: "Solo" });
    const { form } = withForm(definition, form => usePopulate(form, definition, single));

    writeInput(form, ["profile"], "alice");
    await settle();

    expect(readInput(form, ["firstName"])).toBe("Solo");
  });

  it("reverts everything it wrote when the trigger is emptied", async () => {
    const { form } = withForm(definition, form => usePopulate(form, definition, resolveProfile));

    writeInput(form, ["profile"], "alice");
    await settle();
    writeInput(form, ["profile"], undefined);
    await settle();

    expect(readInput(form, ["firstName"])).toBe(""); // back to its initial value
    expect(readInput(form, ["lastName"])).toBeUndefined();
  });

  it("restores what the USER had typed before populate overwrote it", async () => {
    const { form } = withForm(definition, form => usePopulate(form, definition, resolveProfile));

    writeInput(form, ["firstName"], "Handwritten");
    writeInput(form, ["profile"], "alice");
    await settle();
    expect(readInput(form, ["firstName"])).toBe("Alice");

    writeInput(form, ["profile"], undefined);
    await settle();

    expect(readInput(form, ["firstName"])).toBe("Handwritten");
  });

  it("keeps the FIRST snapshot across repeated populates, then restores it", async () => {
    const { form } = withForm(definition, form => usePopulate(form, definition, resolveProfile));

    writeInput(form, ["firstName"], "Original");
    writeInput(form, ["profile"], "alice");
    await settle();
    writeInput(form, ["profile"], "bob");
    await settle();
    expect(readInput(form, ["firstName"])).toBe("Bob");

    writeInput(form, ["profile"], undefined);
    await settle();

    expect(readInput(form, ["firstName"])).toBe("Original");
  });

  it("writes dotted entry names into object leaves and reverts them", async () => {
    const nestedDef: FormDefinition = {
      id: "populate-nested",
      fields: [
        { name: "company", kind: "enum", required: false, options: [{ label: "ACME", value: "acme" }] },
        {
          name: "address", kind: "object", fields: [
            { name: "city", kind: "string", required: false },
          ],
        },
      ],
      affects: [{ effect: "populate", trigger: ["company"], source: "hq" }],
    };
    const resolveHq: PopulateResolver = () => ({ "address.city": "Springfield" });

    const { form } = withForm(nestedDef, form => usePopulate(form, nestedDef, resolveHq));

    writeInput(form, ["company"], "acme");
    await settle();
    expect(readInput(form, ["address", "city"])).toBe("Springfield");

    writeInput(form, ["company"], undefined);
    await settle();
    expect(readInput(form, ["address", "city"])).toBeUndefined();
  });

  it("skips and warns on entries naming unknown fields (no allow list to catch them)", async () => {
    const noAllowDef: FormDefinition = {
      ...definition,
      id: "populate-no-allow",
      affects: [{ effect: "populate", trigger: ["profile"], source: "profileLookup" }],
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rogue: PopulateResolver = () => ({ firstName: "Ok", ghost: "polluted" });
    const { form } = withForm(noAllowDef, form => usePopulate(form, noAllowDef, rogue));

    writeInput(form, ["profile"], "alice");
    await settle();

    expect(readInput(form, ["firstName"])).toBe("Ok");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown field "ghost"'));
    warn.mockRestore();
  });

  it("reports isPopulating while a lookup is in flight", async () => {
    const pending = deferred<Record<string, unknown>>();
    const { form, result } = withForm(definition, form =>
      usePopulate(form, definition, () => pending.promise));

    writeInput(form, ["profile"], "alice");
    await settle();
    expect(result.isPopulating.value).toBe(true);

    pending.release({ firstName: "Late" });
    await settle();
    expect(result.isPopulating.value).toBe(false);
  });

  it("discards a lookup that settles after the trigger was emptied", async () => {
    const pending = deferred<Record<string, unknown>>();
    const { form } = withForm(definition, form =>
      usePopulate(form, definition, () => pending.promise));

    writeInput(form, ["profile"], "alice");
    await settle();

    writeInput(form, ["profile"], undefined); // user deselects before the lookup lands
    await settle();

    pending.release({ firstName: "Ghost" });
    await settle();

    expect(readInput(form, ["firstName"])).toBe("");
  });
});
