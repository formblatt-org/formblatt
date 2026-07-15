import { describe, expect, it } from "vitest";
import { getByPath } from "~/lib/path";
import { resolveFieldByPath } from "~/lib/field";
import type { FormDefinition } from "~/types";

describe("getByPath", () => {
  it("walks nested objects and arrays", () => {
    expect(getByPath({ a: { b: 1 } }, ["a", "b"])).toBe(1);
    expect(getByPath({ list: [{ x: "hit" }] }, ["list", 0, "x"])).toBe("hit");
  });

  it("returns the root for an empty path", () => {
    const root = { a: 1 };
    expect(getByPath(root, [])).toBe(root);
  });

  it("short-circuits to undefined on any nullish hop instead of throwing", () => {
    expect(getByPath({ a: null }, ["a", "b"])).toBeUndefined();
    expect(getByPath(undefined, ["a"])).toBeUndefined();
    expect(getByPath({}, ["a", "b", "c"])).toBeUndefined();
  });
});

describe("resolveFieldByPath", () => {
  const def: FormDefinition = {
    id: "path-fixture",
    fields: [
      { name: "firstName", kind: "string" },
      {
        name: "lines", kind: "array",
        item: {
          name: "line", kind: "object",
          fields: [
            { name: "sku", kind: "string" },
            { name: "qty", kind: "number" },
          ],
        },
      },
      {
        name: "address", kind: "object",
        fields: [{ name: "city", kind: "string" }],
      },
    ],
  };

  it("resolves top-level and nested-object fields", () => {
    expect(resolveFieldByPath(def, ["firstName"])?.name).toBe("firstName");
    expect(resolveFieldByPath(def, ["address", "city"])?.name).toBe("city");
  });

  it("resolves through array indices to the item and its children", () => {
    expect(resolveFieldByPath(def, ["lines"])?.kind).toBe("array");
    expect(resolveFieldByPath(def, ["lines", 0])?.kind).toBe("object");
    expect(resolveFieldByPath(def, ["lines", 3, "qty"])?.name).toBe("qty"); // any index works
  });

  it("returns undefined for unknown names and misplaced indices", () => {
    expect(resolveFieldByPath(def, ["nope"])).toBeUndefined();
    expect(resolveFieldByPath(def, ["firstName", 0])).toBeUndefined(); // numeric key on a non-array
    expect(resolveFieldByPath(def, ["lines", 0, "nope"])).toBeUndefined();
  });
});
