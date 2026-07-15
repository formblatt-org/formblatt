import { describe, expect, it, vi } from "vitest";
import type { FormDefinition, Option, OptionsResolver } from "@formblatt/core";
import { useOptions } from "../src/composables/useOptions";
import { readInput, writeInput } from "../src/form-store";
import { deferred, settle, withForm } from "./harness";

const STATES: Record<string, Option[]> = {
  us: [{ label: "California", value: "ca" }, { label: "New York", value: "ny" }],
  de: [{ label: "Berlin", value: "be" }],
};

const definition: FormDefinition = {
  id: "options",
  fields: [
    { name: "country", kind: "enum", required: false, optionsSource: { source: "countries" } },
    {
      name: "state", kind: "enum", required: false,
      optionsSource: { source: "states", dependsOn: [["country"]] },
    },
  ],
};

const resolveStates: OptionsResolver = (source, { deps }) => {
  if (source === "countries") return [{ label: "US", value: "us" }, { label: "Germany", value: "de" }];
  return STATES[deps.country as string] ?? [];
};

describe("useOptions", () => {
  it("loads a source with no dependencies on mount", async () => {
    const { result } = withForm(definition, form => useOptions(form, definition, resolveStates));
    await settle();

    expect(result.optionsFor(["country"])).toEqual([
      { label: "US", value: "us" },
      { label: "Germany", value: "de" },
    ]);
  });

  it("passes dependencies keyed by their last path segment", async () => {
    const resolve = vi.fn<OptionsResolver>(resolveStates);
    const { form } = withForm(definition, form => useOptions(form, definition, resolve));

    writeInput(form, ["country"], "de");
    await settle();

    expect(resolve).toHaveBeenCalledWith("states", expect.objectContaining({
      path: ["state"],
      deps: { country: "de" },
    }));
  });

  it("reloads a dependent field's options when its dependency changes", async () => {
    const { form, result } = withForm(definition, form => useOptions(form, definition, resolveStates));

    writeInput(form, ["country"], "us");
    await settle();

    expect(result.optionsFor(["state"])).toEqual(STATES.us);
  });

  // the populate-vs-cascade race: a value written by populate must survive the
  // cascade reload that follows, as long as the fresh options still offer it
  it("KEEPS a value the freshly loaded options still contain", async () => {
    const { form } = withForm(definition, form => useOptions(form, definition, resolveStates));

    writeInput(form, ["state"], "be"); // as populate would
    writeInput(form, ["country"], "de");
    await settle();

    expect(readInput(form, ["state"])).toBe("be");
  });

  it("CLEARS a value the freshly loaded options no longer contain", async () => {
    const { form } = withForm(definition, form => useOptions(form, definition, resolveStates));

    writeInput(form, ["state"], "ca"); // a US state
    writeInput(form, ["country"], "de"); // ...but Germany is selected
    await settle();

    expect(readInput(form, ["state"])).toBeUndefined();
  });

  it("clears the dependent value and its options when the dependency is emptied", async () => {
    const { form, result } = withForm(definition, form => useOptions(form, definition, resolveStates));

    writeInput(form, ["country"], "us");
    await settle();
    writeInput(form, ["state"], "ca");

    writeInput(form, ["country"], undefined);
    await settle();

    expect(readInput(form, ["state"])).toBeUndefined();
    expect(result.optionsFor(["state"])).toEqual([]);
  });

  it("discards a stale response when the dependency changed while it was in flight", async () => {
    const slow = deferred<Option[]>();
    let call = 0;

    const resolve: OptionsResolver = (source, { deps }) => {
      if (source === "countries") return [];
      call++;
      return call === 1 ? slow.promise : STATES[deps.country as string] ?? [];
    };

    const { form, result } = withForm(definition, form => useOptions(form, definition, resolve));

    writeInput(form, ["country"], "us");
    await settle();
    writeInput(form, ["country"], "de"); // supersedes the in-flight US load
    await settle();

    slow.release(STATES.us!); // the stale US response lands last
    await settle();

    expect(result.optionsFor(["state"])).toEqual(STATES.de);
  });

  it("loads options for an object-nested enum with its nested path", async () => {
    const nestedDef: FormDefinition = {
      id: "options-nested",
      fields: [{
        name: "address", kind: "object", fields: [
          { name: "country", kind: "enum", required: false, optionsSource: { source: "countries" } },
        ],
      }],
    };

    const resolve = vi.fn<OptionsResolver>(() => [{ label: "US", value: "us" }]);
    const { result } = withForm(nestedDef, form => useOptions(form, nestedDef, resolve));
    await settle();

    expect(resolve).toHaveBeenCalledWith("countries", expect.objectContaining({
      path: ["address", "country"],
    }));
    expect(result.optionsFor(["address", "country"])).toEqual([{ label: "US", value: "us" }]);
  });

  it("warns instead of loading for an optionsSource inside an array item", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const itemDef: FormDefinition = {
      id: "options-in-array",
      fields: [{
        name: "lines", kind: "array",
        item: {
          name: "line", kind: "object",
          fields: [{ name: "unit", kind: "enum", required: false, optionsSource: { source: "units" } }],
        },
      }],
    };

    const resolve = vi.fn<OptionsResolver>(() => []);
    withForm(itemDef, form => useOptions(form, itemDef, resolve));
    await settle();

    expect(resolve).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("lines.unit"));
    warn.mockRestore();
  });

  it("reports isLoadingOptions while a load is in flight", async () => {
    const pending = deferred<Option[]>();
    const { result } = withForm(definition, form =>
      useOptions(form, definition, () => pending.promise));
    await settle();

    expect(result.isLoadingOptions(["country"])).toBe(true);
    expect(result.isLoadingAnyOptions.value).toBe(true);

    pending.release([]);
    await settle();

    expect(result.isLoadingOptions(["country"])).toBe(false);
    expect(result.isLoadingAnyOptions.value).toBe(false);
  });
});
