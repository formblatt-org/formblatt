import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { buildFormSchema, buildInitialInput } from "~/lib/form-builder";
import type { FormDefinition } from "~/types";

/** same formatter the ad-hoc nitro test routes used */
function run(schema: ReturnType<typeof buildFormSchema>, input: unknown): "valid" | string[] {
  const r = v.safeParse(schema, input);
  return r.success ? "valid" : r.issues.map(i => `${i.message} @ ${i.path?.map(p => (p as any).key).join(".")}`);
}

describe("order lines fixture (per-row ObjectChecks + number semantics)", () => {
  const def: FormDefinition = {
    id: "lines-fixture",
    fields: [
      {
        name: "lines", kind: "array",
        item: {
          name: "line", kind: "object",
          checks: [
            { when: { path: ["sku"], op: "eq", value: "TS-001" }, assert: { path: ["qty"], op: "gte", value: 10 }, target: "qty", error: "Min. qty 10" },
            { when: { path: ["sku"], op: "eq", value: "CP-114" }, assert: { path: ["qty"], op: "lte", value: 20 }, target: "qty", error: "Max. qty 20" },
          ],
          fields: [
            { name: "sku", kind: "string" },
            { name: "qty", kind: "number", validations: [{ type: "minValue", value: 1, message: "Min. 1" }] },
          ],
        },
      },
      { name: "optionalNum", kind: "number", required: false },
    ],
  };
  const schema = buildFormSchema(def);
  const lines = (rows: unknown[]) => ({ lines: rows });

  it("flags TS-001 below its SKU minimum, on the right row", () => {
    expect(run(schema, lines([{ sku: "TS-001", qty: 5 }]))).toEqual(["Min. qty 10 @ lines.0.qty"]);
  });

  it("accepts TS-001 exactly at the gte boundary", () => {
    expect(run(schema, lines([{ sku: "TS-001", qty: 10 }]))).toBe("valid");
  });

  it("does not apply TS-001's minimum to other SKUs", () => {
    expect(run(schema, lines([{ sku: "CP-114", qty: 2 }]))).toBe("valid");
  });

  it("keeps the uniform sanity floor of 1", () => {
    expect(run(schema, lines([{ sku: "CP-114", qty: 0 }]))).toEqual(["Min. 1 @ lines.0.qty"]);
  });

  it("flags CP-114 above its SKU maximum", () => {
    expect(run(schema, lines([{ sku: "CP-114", qty: 25 }]))).toEqual(["Max. qty 20 @ lines.0.qty"]);
  });

  it("reports each row's own violation simultaneously", () => {
    expect(run(schema, lines([{ sku: "TS-001", qty: 3 }, { sku: "CP-114", qty: 21 }])))
      .toEqual(["Min. qty 10 @ lines.0.qty", "Max. qty 20 @ lines.1.qty"]);
  });

  it("reports a missing required number as required, not as a type error", () => {
    expect(run(schema, lines([{ sku: "TS-001", qty: undefined }]))).toEqual(["This field is required @ lines.0.qty"]);
  });

  it("treats NaN like a missing value (defense in depth)", () => {
    expect(run(schema, lines([{ sku: "TS-001", qty: NaN }]))).toEqual(["This field is required @ lines.0.qty"]);
  });

  it("lets an optional number stay undefined", () => {
    expect(run(schema, { lines: [{ sku: "TS-001", qty: 12 }], optionalNum: undefined })).toBe("valid");
  });
});

describe("conditional fields (affects) and required-when-visible", () => {
  const def: FormDefinition = {
    id: "cond-fixture",
    fields: [
      { name: "email", kind: "string", validations: [{ type: "email" }] },
      { name: "password", kind: "string", validations: [{ type: "minLength", value: 8 }] },
    ],
    affects: [
      { when: { path: ["email"], op: "eq", value: "hide@example.com" }, effect: "hideAndClear", targets: [["password"]] },
      // populate affects must be ignored by schema building
      { effect: "populate", trigger: ["email"], source: "whatever" },
    ],
  };
  const schema = buildFormSchema(def);

  it("passes a hidden conditional field left undefined (the invisible-blocker trap)", () => {
    expect(run(schema, { email: "hide@example.com", password: undefined })).toBe("valid");
  });

  it("requires the conditional field once visible", () => {
    expect(run(schema, { email: "user@example.com", password: undefined })).toEqual(["This field is required @ password"]);
  });

  it("does NOT duplicate the required message for a visible empty conditional field", () => {
    const errors = run(schema, { email: "user@example.com", password: "" });
    expect(errors).toEqual([
      "Invalid length: Expected >=8 but received 0 @ password",
      "This field is required @ password",
    ]);
    // regression: in-pipe nonEmpty + requiredWhenVisible once produced this message twice
    const requiredCount = (errors as string[]).filter(e => e.startsWith("This field is required")).length;
    expect(requiredCount).toBe(1);
  });

  it("passes when the visible conditional field is filled", () => {
    expect(run(schema, { email: "user@example.com", password: "12345678" })).toBe("valid");
  });
});

describe("field kind semantics", () => {
  const def: FormDefinition = {
    id: "kinds-fixture",
    fields: [
      { name: "firstName", kind: "string" },
      { name: "nickname", kind: "string", required: false },
      { name: "birthDate", kind: "date", required: false },
      { name: "color", kind: "enum", options: [{ label: "Red", value: "red" }, { label: "Blue", value: "blue" }] },
      { name: "flavor", kind: "enum", required: false, options: [{ label: "Mint", value: "mint" }] },
      { name: "country", kind: "enum", optionsSource: { source: "countries" } },
      { name: "fullName", kind: "string", required: false, computed: { expression: { const: "" } } },
    ],
  };
  const schema = buildFormSchema(def);
  const base = { firstName: "A", color: "red", country: "anything" };

  it("requires non-empty strings ('' fails with exactly one required error)", () => {
    const errors = run(schema, { ...base, firstName: "" });
    expect(errors).toEqual(["This field is required @ firstName"]);
  });

  it("allows optional strings to be empty or missing", () => {
    expect(run(schema, { ...base, nickname: "" })).toBe("valid");
    expect(run(schema, base)).toBe("valid");
  });

  it("validates dates as ISO strings, not Date objects", () => {
    expect(run(schema, { ...base, birthDate: "1996-06-10" })).toBe("valid");
    expect(run(schema, { ...base, birthDate: "10/06/1996" })).not.toBe("valid");
  });

  it("restricts static enums to their options", () => {
    expect(run(schema, { ...base, color: "green" })).not.toBe("valid");
  });

  it("accepts any string for dynamic (optionsSource) enums", () => {
    expect(run(schema, { ...base, country: "not-a-known-country" })).toBe("valid");
  });

  it("reports a deselected required enum as required, not as a type error", () => {
    expect(run(schema, { ...base, color: undefined })).toEqual(["This field is required @ color"]);
  });

  it("reports a deselected required dynamic enum as required — '' must not satisfy it", () => {
    expect(run(schema, { ...base, country: undefined })).toEqual(["This field is required @ country"]);
    expect(run(schema, { ...base, country: "" })).toEqual(["This field is required @ country"]);
  });

  it("lets an optional enum stay deselected", () => {
    expect(run(schema, { ...base, flavor: undefined })).toBe("valid");
  });

  it("never lets a computed field block validation", () => {
    expect(run(schema, { ...base, fullName: undefined })).toBe("valid");
  });
});

describe("requiredMessage overrides", () => {
  const def: FormDefinition = {
    id: "required-message-fixture",
    fields: [
      { name: "name", kind: "string", requiredMessage: "Tell us your name" },
      { name: "age", kind: "number", requiredMessage: "Age is mandatory" },
      { name: "color", kind: "enum", requiredMessage: "Pick a color", options: [{ label: "Red", value: "red" }] },
      { name: "secret", kind: "string", requiredMessage: "Secret required" },
    ],
    affects: [
      { effect: "hideAndClear", when: { path: ["name"], op: "eq", value: "hide" }, targets: [["secret"]] },
    ],
  };
  const schema = buildFormSchema(def);

  it("replaces the default message on each required kind", () => {
    expect(run(schema, { name: "", age: undefined, color: undefined, secret: "s" })).toEqual([
      "Tell us your name @ name",
      "Age is mandatory @ age",
      "Pick a color @ color",
    ]);
  });

  it("replaces it on the visibility-aware required check too", () => {
    expect(run(schema, { name: "A", age: 1, color: "red", secret: undefined }))
      .toEqual(["Secret required @ secret"]);
  });
});

describe("conditional fields never double-report their required error", () => {
  const def: FormDefinition = {
    id: "conditional-kinds-fixture",
    fields: [
      { name: "trigger", kind: "boolean", required: false },
      { name: "note", kind: "string" },
      { name: "region", kind: "enum", optionsSource: { source: "regions" } },
    ],
    affects: [
      { effect: "show", when: { path: ["trigger"], op: "truthy" }, targets: [["note"], ["region"]] },
    ],
  };
  const schema = buildFormSchema(def);

  // a dynamic enum's required check is an in-pipe nonEmpty, which would fire alongside
  // requiredWhenVisible on "" — the same double-report the string kind once had
  it("reports an empty visible dynamic enum exactly once", () => {
    expect(run(schema, { trigger: true, note: "n", region: "" }))
      .toEqual(["This field is required @ region"]);
  });

  it("reports an empty visible string exactly once", () => {
    expect(run(schema, { trigger: true, note: "", region: "eu" }))
      .toEqual(["This field is required @ note"]);
  });

  it("lets both stay empty while hidden", () => {
    expect(run(schema, { trigger: false, note: undefined, region: undefined })).toBe("valid");
  });
});

describe("buildInitialInput", () => {
  it("collects initial values and omits fields without one", () => {
    const def: FormDefinition = {
      id: "init-fixture",
      fields: [
        { name: "email", kind: "string", initial: "user@example.com" },
        { name: "empty", kind: "string" },
        {
          name: "address", kind: "object", fields: [
            { name: "city", kind: "string", initial: "Berlin" },
            { name: "zip", kind: "string" },
          ],
        },
        { name: "lines", kind: "array", item: { name: "line", kind: "string" }, initial: ["a"] },
      ],
    };
    expect(buildInitialInput(def)).toEqual({
      email: "user@example.com",
      address: { city: "Berlin" },
      lines: ["a"],
    });
  });
});
