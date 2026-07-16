import { describe, expect, it, vi } from "vitest";
import { validateDefinition } from "~/lib/definition-schema";
import { migrateDefinition } from "~/lib/definition-migrations";
import type { FormDefinition } from "~/types";

/** exercises every contract feature in one definition */
const kitchenSink: FormDefinition = {
  schemaVersion: 1,
  id: "kitchen-sink",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "email", kind: "string", control: "email", initial: "a@example.com", validations: [{ type: "email", message: "nope" }] },
    { name: "profile", kind: "enum", required: false, options: [{ label: "A", value: "a" }] },
    { name: "country", kind: "enum", optionsSource: { source: "countries" } },
    { name: "state", kind: "enum", required: false, optionsSource: { source: "states", dependsOn: [["country"]] } },
    { name: "fullName", kind: "string", required: false, computed: { expression: { op: "concat", sep: " ", args: [{ ref: ["email"] }, { const: "x" }] } } },
    { name: "age", kind: "number", required: false, computed: { expression: { op: "dateDiff", unit: "years", args: [{ ref: ["birthDate"] }, { op: "now" }] } } },
    { name: "tier", kind: "string", required: false, computed: { expression: { op: "lookup", on: { ref: ["profile"] }, table: { a: "Standard" }, default: { const: "Unknown" } } } },
    { name: "tierBadge", kind: "string", required: false, transient: true },
    { name: "tax", kind: "number", required: false, hidden: true, computed: { source: "tax", dependsOn: [["lines"]] } },
    { name: "birthDate", kind: "date", required: false, disabled: true },
    {
      name: "lines", kind: "array", initial: [{ sku: "X", qty: 1 }],
      item: {
        name: "line", kind: "object",
        checks: [{ when: { path: ["sku"], op: "eq", value: "X" }, assert: { path: ["qty"], op: "gte", value: 1 }, error: "min 1", target: "qty" }],
        fields: [
          { name: "sku", kind: "string" },
          { name: "qty", kind: "number" },
          { name: "lineTotal", kind: "number", required: false, computed: { expression: { op: "round", precision: 2, args: [{ op: "mul", args: [{ ref: ["qty"] }, { const: 2 }] }] } } },
        ],
      },
    },
  ],
  affects: [
    { effect: "hideAndClear", when: { and: [{ path: ["email"], op: "notEmpty" }, { not: { path: ["profile"], op: "eq", value: "a" } }] }, targets: [["state"]] },
    { effect: "populate", trigger: ["profile"], source: "lookup", allow: ["email"] },
  ],
  layout: [
    { type: "field", name: "email" },
    { type: "section", id: "s1", title: "S1", collapsed: true, visibleWhen: { path: ["email"], op: "notEmpty" }, children: [{ type: "field", name: "profile" }] },
  ],
  orphanSection: { title: "Other", id: "other", collapsed: false },
};

describe("validateDefinition", () => {
  it("accepts a definition exercising the whole contract, returning it unchanged", () => {
    expect(validateDefinition(kitchenSink)).toBe(kitchenSink);
  });

  it("composes with the migration chain", () => {
    const versionless = { ...kitchenSink, schemaVersion: undefined };
    expect(validateDefinition(migrateDefinition(versionless as FormDefinition))).toBe(versionless);
  });

  it("rejects an unknown field kind with the offending path", () => {
    const def = { id: "x", fields: [{ name: "a", kind: "strang" }] };
    expect(() => validateDefinition(def)).toThrowError(/fields\.0/);
  });

  it("rejects an unknown affect effect (previously silently treated as hide)", () => {
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "string" }],
      affects: [{ effect: "hideWhen", when: { path: ["a"], op: "truthy" }, targets: [["a"]] }],
    };
    expect(() => validateDefinition(def)).toThrowError(/affects\.0/);
  });

  it("rejects an unknown condition operator", () => {
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "string" }],
      affects: [{ effect: "hide", when: { path: ["a"], op: "equals", value: 1 }, targets: [["a"]] }],
    };
    expect(() => validateDefinition(def)).toThrow();
  });

  it("rejects a malformed expression", () => {
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "number", computed: { expression: { op: "avg", args: [] } } }],
    };
    expect(() => validateDefinition(def)).toThrow();
  });

  it("rejects a lookup whose table is not an object", () => {
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "string", computed: { expression: { op: "lookup", on: { ref: ["a"] }, table: "not-a-table" } } }],
    };
    expect(() => validateDefinition(def)).toThrow();
  });

  it("rejects an unknown layout node type and a missing id", () => {
    expect(() => validateDefinition({ id: "x", fields: [], layout: [{ type: "grid", children: [] }] })).toThrow();
    expect(() => validateDefinition({ fields: [] })).toThrowError(/id/);
  });

  it("reports non-object garbage without crashing", () => {
    expect(() => validateDefinition(null)).toThrow();
    expect(() => validateDefinition("nope")).toThrow();
  });

  it("throws on lint errors — a rule typo no longer passes validation", () => {
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "string", validations: [{ type: "minLenght", value: 8 }] }],
    };
    expect(() => validateDefinition(def)).toThrowError(/minLenght/);
  });

  it("throws on an affect targeting a field inside an array item", () => {
    const def = {
      id: "x",
      fields: [
        { name: "a", kind: "string" },
        { name: "lines", kind: "array", item: { name: "line", kind: "object", fields: [{ name: "qty", kind: "number" }] } },
      ],
      affects: [{ effect: "hide", when: { path: ["a"], op: "truthy" }, targets: [["lines", 0, "qty"]] }],
    };
    expect(() => validateDefinition(def)).toThrowError(/cannot target rows/);
  });

  it("logs lint warnings without rejecting the definition", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const def = {
      id: "x",
      fields: [{ name: "a", kind: "string" }],
      layout: [{ type: "field", name: "ghost" }],
    };
    expect(validateDefinition(def)).toBe(def);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown field "ghost"'));
    warn.mockRestore();
  });
});
