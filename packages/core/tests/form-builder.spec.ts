import { describe, expect, it, vi } from "vitest";
import * as v from "valibot";
import { buildFormSchema, buildInitialInput } from "~/lib/form-builder";
import type { FormDefinition } from "~/types";

/** same formatter the ad-hoc nitro test routes used */
function run(schema: ReturnType<typeof buildFormSchema>, input: unknown): "valid" | string[] {
  // these fixtures are remote-free, so the schema is the sync variant
  const r = v.safeParse(schema as v.GenericSchema<Record<string, unknown>>, input);
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

describe("boolean and date required/validation semantics", () => {
  const def: FormDefinition = {
    id: "bool-date-fixture",
    fields: [
      { name: "terms", kind: "boolean", requiredMessage: "Please accept the terms", validations: [{ type: "isTrue", message: "You must accept the terms" }] },
      { name: "newsletter", kind: "boolean", required: false },
      { name: "startDate", kind: "date", requiredMessage: "Start date is required", validations: [
        { type: "minValue", value: "2020-01-01", message: "No earlier than 2020" },
        { type: "maxValue", value: "2030-12-31", message: "No later than 2030" },
      ] },
    ],
  };
  const schema = buildFormSchema(def);
  const base = { terms: true, startDate: "2025-06-15" };

  it("reports a missing required boolean with its required message, not a type error", () => {
    expect(run(schema, { ...base, terms: undefined })).toEqual(["Please accept the terms @ terms"]);
  });

  it("rejects an unchecked isTrue boolean — false is present but not accepted", () => {
    expect(run(schema, { ...base, terms: false })).toEqual(["You must accept the terms @ terms"]);
  });

  it("lets an optional boolean stay undefined or false", () => {
    expect(run(schema, base)).toBe("valid");
    expect(run(schema, { ...base, newsletter: false })).toBe("valid");
  });

  it("reports a missing required date with its required message, not a type error", () => {
    expect(run(schema, { ...base, startDate: undefined })).toEqual(["Start date is required @ startDate"]);
  });

  it("keeps isoDate's own error for a present but malformed date", () => {
    expect(run(schema, { ...base, startDate: "15.06.2025" })).not.toBe("valid");
    expect(run(schema, { ...base, startDate: "15.06.2025" })).not.toEqual(["Start date is required @ startDate"]);
  });

  it("enforces min/max date bounds in date order", () => {
    expect(run(schema, { ...base, startDate: "2019-12-31" })).toEqual(["No earlier than 2020 @ startDate"]);
    expect(run(schema, { ...base, startDate: "2031-01-01" })).toEqual(["No later than 2030 @ startDate"]);
    expect(run(schema, { ...base, startDate: "2020-01-01" })).toBe("valid");
    expect(run(schema, { ...base, startDate: "2030-12-31" })).toBe("valid");
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

describe("hidden and disabled fields never enforce their required check", () => {
  const def: FormDefinition = {
    id: "hidden-disabled-fixture",
    fields: [
      { name: "visibleName", kind: "string" },
      { name: "trackingId", kind: "string", hidden: true },
      { name: "plan", kind: "enum", disabled: true, options: [{ label: "Pro", value: "pro" }] },
      { name: "vat", kind: "number", disabled: true, validations: [{ type: "minValue", value: 0, message: "Min. 0" }] },
    ],
  };
  const schema = buildFormSchema(def);

  it("passes hidden and disabled required fields left undefined (the invisible-blocker trap)", () => {
    expect(run(schema, { visibleName: "A" })).toBe("valid");
  });

  it("still applies content validations to a filled disabled field", () => {
    expect(run(schema, { visibleName: "A", vat: -1 })).toEqual(["Min. 0 @ vat"]);
  });

  it("still restricts a filled disabled enum to its options", () => {
    expect(run(schema, { visibleName: "A", plan: "free" })).not.toBe("valid");
  });

  it("re-requires a hidden field once a show affect reveals it", () => {
    const affectDef: FormDefinition = {
      id: "hidden-affect-fixture",
      fields: [
        { name: "toggle", kind: "boolean", required: false },
        { name: "ghost", kind: "string", hidden: true },
      ],
      affects: [
        { effect: "show", when: { path: ["toggle"], op: "truthy" }, targets: [["ghost"]] },
      ],
    };
    const affectSchema = buildFormSchema(affectDef);

    expect(run(affectSchema, { toggle: false })).toBe("valid");
    expect(run(affectSchema, { toggle: true })).toEqual(["This field is required @ ghost"]);
    expect(run(affectSchema, { toggle: true, ghost: "filled" })).toBe("valid");
  });

  it("never re-requires a hidden field only a hide affect targets", () => {
    const hideOnlyDef: FormDefinition = {
      id: "hidden-hide-only-fixture",
      fields: [
        { name: "email", kind: "string", required: false },
        { name: "confirmPassword", kind: "string", hidden: true },
      ],
      affects: [
        { effect: "hideAndClear", when: { path: ["email"], op: "eq", value: "x" }, targets: [["confirmPassword"]] },
      ],
    };
    const hideOnlySchema = buildFormSchema(hideOnlyDef);

    // the hide rule "allows" the field while email != x, but a hide affect
    // never reveals a hidden field — so it must not be re-required either
    expect(run(hideOnlySchema, { email: "anything" })).toBe("valid");
    expect(run(hideOnlySchema, { email: "x" })).toBe("valid");
  });
});

describe("message catalog", () => {
  const def: FormDefinition = {
    id: "catalog",
    fields: [
      { name: "name", kind: "string", label: "Name", validations: [{ type: "minLength", value: 3 }] },
      { name: "start", kind: "date", label: "Start", required: false },
      { name: "color", kind: "enum", label: "Farbe", required: false, options: [{ label: "Rot", value: "rot" }] },
      { name: "custom", kind: "string", required: false, requiredMessage: "own message", validations: [{ type: "minLength", value: 5, message: "explicit wins" }] },
    ],
  };
  const schema = buildFormSchema(def, {
    messages: {
      required: "{field} fehlt",
      minLength: "{field} braucht mindestens {value} Zeichen",
      isoDate: "{field} ist kein Datum",
      picklist: "{field} kennt diesen Wert nicht",
    },
  });
  const base = { name: "Ada" };

  it("interpolates {field} and {value} into rule messages", () => {
    expect(run(schema, { name: "ab" })).toEqual(["Name braucht mindestens 3 Zeichen @ name"]);
  });

  it("uses the catalog's required template for fields without their own message", () => {
    // "" also fails minLength — both messages come from the catalog
    expect(run(schema, { name: "" })).toEqual([
      "Name fehlt @ name",
      "Name braucht mindestens 3 Zeichen @ name",
    ]);
    expect(run(schema, { name: undefined })).toEqual(["Name fehlt @ name"]);
  });

  it("covers the special isoDate and picklist cases", () => {
    expect(run(schema, { ...base, start: "not-a-date" })).toEqual(["Start ist kein Datum @ start"]);
    expect(run(schema, { ...base, color: "blau" })).toEqual(["Farbe kennt diesen Wert nicht @ color"]);
  });

  it("lets explicit field/rule messages win over the catalog", () => {
    expect(run(schema, { ...base, custom: "abcd" })).toEqual(["explicit wins @ custom"]);
  });
});

describe("multiple enums", () => {
  const def: FormDefinition = {
    id: "multi-enum",
    fields: [
      {
        name: "toppings", kind: "enum", multiple: true, requiredMessage: "Pick at least one",
        options: [{ label: "Cheese", value: "cheese" }, { label: "Ham", value: "ham" }],
      },
      { name: "tags", kind: "enum", multiple: true, required: false, optionsSource: { source: "tags" } },
    ],
  };
  const schema = buildFormSchema(def);

  it("accepts a list of declared option values", () => {
    expect(run(schema, { toppings: ["cheese", "ham"] })).toBe("valid");
  });

  it("rejects values outside the options", () => {
    expect(run(schema, { toppings: ["cheese", "pineapple"] })).not.toBe("valid");
  });

  it("requires at least one choice — [] and undefined both report the required message", () => {
    expect(run(schema, { toppings: [] })).toEqual(["Pick at least one @ toppings"]);
    expect(run(schema, { toppings: undefined })).toEqual(["Pick at least one @ toppings"]);
  });

  it("lets an optional dynamic multi-enum hold any strings or stay unset", () => {
    expect(run(schema, { toppings: ["ham"], tags: ["a", "b"] })).toBe("valid");
    expect(run(schema, { toppings: ["ham"] })).toBe("valid");
  });
});

describe("custom validation rules", () => {
  const def: FormDefinition = {
    id: "custom-rules",
    fields: [
      { name: "plate", kind: "string", required: false, validations: [{ type: "licensePlate", message: "Not a plate" }] },
    ],
  };

  it("applies a host-registered rule like a built-in", () => {
    const schema = buildFormSchema(def, {
      rules: { licensePlate: rule => v.check(value => /^[A-Z]{1,3}-\d+$/.test(String(value)), rule.message) },
    });

    expect(run(schema, { plate: "B-1234" })).toBe("valid");
    expect(run(schema, { plate: "nope" })).toEqual(["Not a plate @ plate"]);
  });

  it("never lets a custom rule shadow a built-in", () => {
    const shadowDef: FormDefinition = {
      id: "shadow",
      fields: [{ name: "mail", kind: "string", required: false, validations: [{ type: "email", message: "Bad mail" }] }],
    };
    const schema = buildFormSchema(shadowDef, {
      rules: { email: () => v.check(() => true) }, // would accept anything
    });

    expect(run(schema, { mail: "not-an-email" })).toEqual(["Bad mail @ mail"]);
  });
});

describe("remote validation rules", () => {
  const def: FormDefinition = {
    id: "remote-rules",
    fields: [
      { name: "username", kind: "string", validations: [{ type: "remote", value: "usernameFree", message: "Taken" }] },
    ],
  };

  async function runAsync(schema: ReturnType<typeof buildFormSchema>, input: unknown): Promise<"valid" | string[]> {
    const r = await v.safeParseAsync(schema, input);
    return r.success ? "valid" : r.issues.map(i => `${i.message} @ ${i.path?.map(p => (p as any).key).join(".")}`);
  }

  it("routes the value to the resolver and reports the rule message on false", async () => {
    const schema = buildFormSchema(def, {
      validationResolver: async (source, value) => source === "usernameFree" && value !== "ada",
    });

    expect(await runAsync(schema, { username: "grace" })).toBe("valid");
    expect(await runAsync(schema, { username: "ada" })).toEqual(["Taken @ username"]);
  });

  it("uses a string verdict as the message", async () => {
    const schema = buildFormSchema(def, {
      validationResolver: () => "Reserved for staff",
    });

    expect(await runAsync(schema, { username: "root" })).toEqual(["Reserved for staff @ username"]);
  });

  it("never calls the resolver for an empty value — that is required's job", async () => {
    const calls: unknown[] = [];
    const schema = buildFormSchema(def, {
      validationResolver: (_source, value) => { calls.push(value); return false; },
    });

    expect(await runAsync(schema, { username: undefined })).toEqual(["This field is required @ username"]);
    expect(calls).toEqual([]);
  });

  it("treats a rejected lookup as valid instead of blocking submit", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const schema = buildFormSchema(def, {
      validationResolver: () => Promise.reject(new Error("service down")),
    });

    expect(await runAsync(schema, { username: "grace" })).toBe("valid");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("treats a rejected lookup as INVALID under remoteFailure: fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const schema = buildFormSchema(def, {
      validationResolver: () => Promise.reject(new Error("service down")),
      remoteFailure: "fail",
    });

    expect(await runAsync(schema, { username: "grace" })).toEqual(["Taken @ username"]);
    errorSpy.mockRestore();
  });

  it("skips remote rules with a warning when no resolver is given", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const schema = buildFormSchema(def);

    expect(await runAsync(schema, { username: "anything" })).toBe("valid");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("usernameFree"));
    warnSpy.mockRestore();
  });
});

describe("transient fields", () => {
  const def: FormDefinition = {
    id: "transient-fixture",
    fields: [
      { name: "size", kind: "string" },
      { name: "hex", kind: "string", required: false, transient: true },
      {
        name: "meta", kind: "object", fields: [
          { name: "keep", kind: "string", required: false },
          { name: "hint", kind: "string", required: false, transient: true },
        ],
      },
      {
        name: "lines", kind: "array", item: {
          name: "line", kind: "object", fields: [
            { name: "qty", kind: "number" },
            { name: "rowNote", kind: "string", required: false, transient: true },
          ],
        },
      },
      { name: "scratch", kind: "array", required: false, transient: true, item: { name: "s", kind: "string" } },
    ],
  };
  const schema = buildFormSchema(def);

  it("strips transient fields from the parsed output — top-level, object-nested, per array row, whole arrays", () => {
    const result = v.safeParse(schema as v.GenericSchema<Record<string, unknown>>, {
      size: "M",
      hex: "#1d4ed8",
      meta: { keep: "yes", hint: "display only" },
      lines: [{ qty: 1, rowNote: "a" }, { qty: 2, rowNote: "b" }],
      scratch: ["tmp"],
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      size: "M",
      meta: { keep: "yes" },
      lines: [{ qty: 1 }, { qty: 2 }],
    });
  });

  it("still validates transient fields — stripped from the output, not from the rules", () => {
    const strict: FormDefinition = {
      id: "transient-validated",
      fields: [{ name: "hex", kind: "string", transient: true, validations: [{ type: "regex", value: "^#", message: "Not a color" }] }],
    };
    expect(run(buildFormSchema(strict), { hex: "oops" })).toEqual(["Not a color @ hex"]);
  });
});

describe("buildInitialInput", () => {
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

  it("collects initial values and omits fields without one", () => {
    expect(buildInitialInput(def)).toEqual({
      email: "user@example.com",
      address: { city: "Berlin" },
      lines: ["a"],
    });
  });

  it("hydrates host data over the declared initials, merging objects per leaf", () => {
    expect(buildInitialInput(def, {
      email: "saved@example.com",
      address: { zip: "10115" }, // city must survive the merge
    })).toEqual({
      email: "saved@example.com",
      address: { city: "Berlin", zip: "10115" },
      lines: ["a"],
    });
  });

  it("replaces arrays wholesale and ignores undefined entries", () => {
    expect(buildInitialInput(def, {
      email: undefined, // "not provided", must not erase the declared initial
      lines: ["x", "y"],
    })).toEqual({
      email: "user@example.com",
      address: { city: "Berlin" },
      lines: ["x", "y"],
    });
  });
});
