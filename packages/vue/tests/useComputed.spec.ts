import { describe, expect, it, vi } from "vitest";
import type { ComputedResolver, FormDefinition } from "@formblatt/core";
import { useComputed } from "../src/composables/useComputed";
import { insertItem, readInput, writeInput } from "../src/form-store";
import { deferred, settle, withForm } from "./harness";

const noopResolver: ComputedResolver = () => undefined;

describe("useComputed — expression mode", () => {
  const definition: FormDefinition = {
    id: "computed-expression",
    fields: [
      { name: "firstName", kind: "string", initial: "Ada" },
      { name: "lastName", kind: "string", initial: "Lovelace" },
      {
        name: "fullName", kind: "string", required: false,
        computed: {
          expression: {
            op: "concat", sep: " ",
            args: [{ ref: ["firstName"] }, { ref: ["lastName"] }],
          },
        },
      },
    ],
  };

  it("derives the value on mount and on every dependency change", async () => {
    const { form } = withForm(definition, form => useComputed(form, definition, noopResolver));
    await settle();
    expect(readInput(form, ["fullName"])).toBe("Ada Lovelace");

    writeInput(form, ["firstName"], "Grace");
    await settle();

    expect(readInput(form, ["fullName"])).toBe("Grace Lovelace");
  });
});

describe("useComputed — per-item expressions", () => {
  const definition: FormDefinition = {
    id: "computed-items",
    fields: [
      {
        name: "lines", kind: "array",
        item: {
          name: "line", kind: "object",
          fields: [
            { name: "qty", kind: "number" },
            { name: "price", kind: "number" },
            {
              name: "lineTotal", kind: "number", required: false,
              computed: {
                expression: {
                  op: "round", precision: 2,
                  args: [{ op: "mul", args: [{ ref: ["qty"] }, { ref: ["price"] }] }],
                },
              },
            },
          ],
        },
        initial: [
          { qty: 2, price: 10 },
          { qty: 3, price: 1.5 },
        ],
      },
    ],
  };

  it("computes each row from that row's own values", async () => {
    const { form } = withForm(definition, form => useComputed(form, definition, noopResolver));
    await settle();

    expect(readInput(form, ["lines", 0, "lineTotal"])).toBe(20);
    expect(readInput(form, ["lines", 1, "lineTotal"])).toBe(4.5);
  });

  it("recomputes the edited row only", async () => {
    const { form } = withForm(definition, form => useComputed(form, definition, noopResolver));
    await settle();

    writeInput(form, ["lines", 0, "qty"], 5);
    await settle();

    expect(readInput(form, ["lines", 0, "lineTotal"])).toBe(50);
    expect(readInput(form, ["lines", 1, "lineTotal"])).toBe(4.5);
  });

  it("stores undefined rather than NaN for a row with no values yet", async () => {
    const { form } = withForm(definition, form => useComputed(form, definition, noopResolver));
    await settle();

    insertItem(form, ["lines"]);
    await settle();

    expect(readInput(form, ["lines", 2, "lineTotal"])).toBeUndefined();
  });
});

describe("useComputed — source mode", () => {
  const definition: FormDefinition = {
    id: "computed-source",
    fields: [
      { name: "subtotal", kind: "number", initial: 100 },
      { name: "tax", kind: "number", required: false, computed: { source: "tax", dependsOn: [["subtotal"]] } },
    ],
  };

  it("passes dependencies keyed by their last path segment", async () => {
    const resolve = vi.fn<ComputedResolver>(() => 8.25);
    withForm(definition, form => useComputed(form, definition, resolve));
    await settle();

    expect(resolve).toHaveBeenCalledWith("tax", expect.objectContaining({
      path: ["tax"],
      deps: { subtotal: 100 },
    }));
  });

  it("reports isComputing while a resolver is in flight", async () => {
    const pending = deferred<number>();
    const { result } = withForm(definition, form =>
      useComputed(form, definition, () => pending.promise));
    await settle();

    expect(result.isComputing(["tax"])).toBe(true);

    pending.release(8.25);
    await settle();

    expect(result.isComputing(["tax"])).toBe(false);
  });

  it("discards a stale response when a newer recompute has started", async () => {
    const slow = deferred<number>();
    const calls: number[] = [];

    const resolve: ComputedResolver = (_source, { deps }) => {
      calls.push(deps.subtotal as number);
      return calls.length === 1 ? slow.promise : 999;
    };

    const { form } = withForm(definition, form => useComputed(form, definition, resolve));
    await settle();

    // supersede the in-flight lookup, then let the stale one settle
    writeInput(form, ["subtotal"], 200);
    await settle();
    slow.release(111);
    await settle();

    expect(readInput(form, ["tax"])).toBe(999);
  });
});
