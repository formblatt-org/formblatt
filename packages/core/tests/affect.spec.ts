import { describe, expect, it } from "vitest";
import { compileAffects, conditionalRequiredFields } from "~/lib/affect";
import type { Affect, Condition, FormDefinition } from "~/types";

const when: Condition = { path: ["a"], op: "eq", value: "yes" };

describe("compileAffects", () => {
  it("show pushes the condition as-is", () => {
    const rules = compileAffects([{ effect: "show", when, targets: [["x"]] }]);
    expect(rules.get('["x"]')).toEqual({ conditions: [when], clearWhenHidden: false });
  });

  it("hide pushes the negated condition", () => {
    const rules = compileAffects([{ effect: "hide", when, targets: [["x"]] }]);
    expect(rules.get('["x"]')).toEqual({ conditions: [{ not: when }], clearWhenHidden: false });
  });

  it("hideAndClear also marks the target for clearing", () => {
    const rules = compileAffects([{ effect: "hideAndClear", when, targets: [["x"]] }]);
    expect(rules.get('["x"]')?.clearWhenHidden).toBe(true);
  });

  it("accumulates multiple rules on the same target (AND semantics)", () => {
    const other: Condition = { path: ["b"], op: "truthy" };
    const rules = compileAffects([
      { effect: "show", when, targets: [["x"]] },
      { effect: "hide", when: other, targets: [["x"]] },
    ]);
    expect(rules.get('["x"]')?.conditions).toEqual([when, { not: other }]);
  });

  it("keeps clearWhenHidden once any rule on the target sets it", () => {
    const other: Condition = { path: ["b"], op: "truthy" };
    const rules = compileAffects([
      { effect: "hideAndClear", when, targets: [["x"]] },
      { effect: "hide", when: other, targets: [["x"]] },
    ]);
    expect(rules.get('["x"]')?.clearWhenHidden).toBe(true);
  });

  it("ignores populate affects entirely — they are side effects, not visibility rules", () => {
    const affects: Affect[] = [{ effect: "populate", trigger: ["a"], source: "s" }];
    expect(compileAffects(affects).size).toBe(0);
  });

  it("handles a missing affects array", () => {
    expect(compileAffects(undefined).size).toBe(0);
  });
});

describe("conditionalRequiredFields", () => {
  const def: FormDefinition = {
    id: "crf-fixture",
    fields: [
      { name: "password", kind: "string" },
      { name: "note", kind: "string", required: false },
      { name: "phone", kind: "string", requiredMessage: "We need a phone number" },
    ],
    affects: [
      { effect: "hideAndClear", when, targets: [["password"], ["note"], ["phone"], ["ghost"]] },
    ],
  };

  it("includes required conditional fields with their compiled conditions", () => {
    const conditional = conditionalRequiredFields(def);
    expect(conditional.map(field => field.path.join("."))).toEqual(["password", "phone"]);
    expect(conditional[0]).toMatchObject({ path: ["password"], conditions: [{ not: when }] });
  });

  it("carries a field's requiredMessage override", () => {
    const phone = conditionalRequiredFields(def).find(field => field.path[0] === "phone");
    expect(phone?.requiredMessage).toBe("We need a phone number");
  });

  it("excludes optional fields and targets that do not exist", () => {
    const names = conditionalRequiredFields(def).map(field => field.path.join("."));
    expect(names).not.toContain("note");
    expect(names).not.toContain("ghost");
  });
});
