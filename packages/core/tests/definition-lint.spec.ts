import { describe, expect, it } from "vitest";
import { lintDefinition } from "~/lib/definition-lint";
import type { FormDefinition } from "~/types";

/** the errors (or all issues) for a definition, as "location: message" strings */
function lint(definition: FormDefinition, severity?: "error" | "warning"): string[] {
  return lintDefinition(definition)
    .filter(issue => !severity || issue.severity === severity)
    .map(issue => `${issue.location}: ${issue.message}`);
}

const clean: FormDefinition = {
  id: "clean",
  fields: [
    { name: "email", kind: "string", validations: [{ type: "email" }] },
    { name: "country", kind: "enum", optionsSource: { source: "countries" } },
    { name: "state", kind: "enum", required: false, optionsSource: { source: "states", dependsOn: [["country"]] } },
    {
      name: "address", kind: "object", fields: [
        { name: "city", kind: "string" },
        { name: "zip", kind: "string", validations: [{ type: "regex", value: "^\\d+$" }] },
      ],
      checks: [{ assert: { path: ["zip"], op: "notEmpty" }, target: "zip", error: "zip!" }],
    },
    {
      name: "lines", kind: "array", item: {
        name: "line", kind: "object", fields: [
          { name: "qty", kind: "number" },
          { name: "total", kind: "number", required: false, computed: { expression: { op: "mul", args: [{ ref: ["qty"] }, { const: 2 }] } } },
        ],
      },
    },
    { name: "summary", kind: "string", required: false, computed: { source: "sum", dependsOn: [["lines"], ["email"]] } },
  ],
  affects: [
    { effect: "show", when: { path: ["email"], op: "notEmpty" }, targets: [["address", "city"]] },
    { effect: "populate", trigger: ["country"], source: "lookup", allow: ["email", "address.city"] },
  ],
  layout: [
    { type: "field", name: "email" },
    { type: "section", id: "s1", title: "S", visibleWhen: { path: ["email"], op: "notEmpty" }, children: [{ type: "field", name: "address.city" }] },
  ],
};

describe("lintDefinition on a clean definition", () => {
  it("finds nothing", () => {
    expect(lint(clean)).toEqual([]);
  });
});

describe("field-level checks", () => {
  it("rejects dots in field names", () => {
    const def: FormDefinition = { id: "x", fields: [{ name: "a.b", kind: "string" }] };
    expect(lint(def, "error")).toEqual([expect.stringContaining('"a.b" contains a dot')]);
  });

  it("rejects duplicate sibling names, including inside objects", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "a", kind: "string" },
        { name: "a", kind: "number" },
        { name: "o", kind: "object", fields: [{ name: "x", kind: "string" }, { name: "x", kind: "string" }] },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining('duplicate field name "a"'));
    expect(errors).toContainEqual(expect.stringContaining('duplicate field name "x"'));
  });

  it("rejects validation rule types the kind does not implement (the typo trap)", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "a", kind: "string", validations: [{ type: "minLenght", value: 8 }] },
        { name: "b", kind: "enum", options: [{ label: "A", value: "a" }], validations: [{ type: "minLength", value: 1 }] },
        { name: "c", kind: "date", validations: [{ type: "minValue", value: "2020-01-01" }] },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toEqual([
      expect.stringContaining('unknown validation "minLenght" for kind "string"'),
      expect.stringContaining('unknown validation "minLength" for kind "enum"'),
    ]);
  });

  it("accepts host-registered rule types passed as customRuleTypes", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{ name: "plate", kind: "string", validations: [{ type: "licensePlate" }] }],
    };
    expect(lintDefinition(def, { customRuleTypes: ["licensePlate"] })).toEqual([]);
    expect(lintDefinition(def)).toHaveLength(1);
  });

  it("accepts remote rules with a source, rejects them without one", () => {
    const good: FormDefinition = {
      id: "x",
      fields: [{ name: "u", kind: "string", validations: [{ type: "remote", value: "usernameFree" }] }],
    };
    const bad: FormDefinition = {
      id: "x",
      fields: [{ name: "u", kind: "string", validations: [{ type: "remote" }] }],
    };
    expect(lint(good)).toEqual([]);
    expect(lint(bad, "error")).toEqual([expect.stringContaining("must name the resolver source")]);
  });

  it("rejects validations on object/array fields (the builder ignores them)", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{ name: "o", kind: "object", fields: [], validations: [{ type: "nonEmpty" }] }],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining("object fields do not support")]);
  });

  it("warns on a static enum without options", () => {
    const def: FormDefinition = { id: "x", fields: [{ name: "e", kind: "enum" }] };
    expect(lint(def, "warning")).toEqual([expect.stringContaining("accepts no value")]);
  });

  it("rejects hidden/disabled on container fields (they have no rendering effect)", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "o", kind: "object", hidden: true, fields: [{ name: "x", kind: "string" }] },
        { name: "lines", kind: "array", disabled: true, item: { name: "i", kind: "string" } },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining("hidden/disabled on an object field"));
    expect(errors).toContainEqual(expect.stringContaining("disabled on an array field"));
  });

  it("warns on nested arrays (they validate but cannot be rendered)", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{
        name: "o", kind: "object", fields: [
          { name: "inner", kind: "array", item: { name: "i", kind: "string" } },
        ],
      }],
    };
    expect(lint(def, "warning")).toEqual([expect.stringContaining("nested arrays")]);
  });
});

describe("computed and dynamic options", () => {
  it("rejects unresolvable expression refs, absolute and row-relative", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "a", kind: "number", computed: { expression: { op: "add", args: [{ ref: ["ghost"] }] } } },
        {
          name: "lines", kind: "array", item: {
            name: "line", kind: "object", fields: [
              { name: "qty", kind: "number" },
              { name: "t", kind: "number", computed: { expression: { ref: ["missing"] } } },
            ],
          },
        },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining('ref ["ghost"] does not resolve'));
    expect(errors).toContainEqual(expect.stringContaining('ref ["missing"] does not resolve'));
  });

  it("accepts refs into if-conditions and rejects broken ones", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "a", kind: "string" },
        { name: "b", kind: "string", computed: { expression: { if: { path: ["nope"], op: "truthy" }, then: { const: 1 }, else: { ref: ["a"] } } } },
      ],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining('["nope"] does not resolve')]);
  });

  it("rejects source-mode computed inside array items", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{
        name: "lines", kind: "array", item: {
          name: "line", kind: "object", fields: [
            { name: "t", kind: "number", computed: { source: "s", dependsOn: [] } },
          ],
        },
      }],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining("source-mode computed is not supported inside array items")]);
  });

  it("rejects optionsSource inside array items", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{
        name: "lines", kind: "array", item: {
          name: "line", kind: "object", fields: [
            { name: "unit", kind: "enum", optionsSource: { source: "units" } },
          ],
        },
      }],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining("optionsSource is not supported inside array items")]);
  });

  it("rejects unresolvable dependsOn paths and terminal-name collisions", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [
        { name: "a", kind: "object", fields: [{ name: "x", kind: "string" }] },
        { name: "b", kind: "object", fields: [{ name: "x", kind: "string" }] },
        { name: "c", kind: "string", computed: { source: "s", dependsOn: [["a", "x"], ["b", "x"], ["ghost"]] } },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining('dependsOn path ["ghost"] does not resolve'));
    expect(errors).toContainEqual(expect.stringContaining("terminal names collide (x)"));
  });
});

describe("object checks", () => {
  const withCheck = (check: object): FormDefinition => ({
    id: "x",
    fields: [{
      name: "o", kind: "object",
      fields: [{ name: "a", kind: "string" }],
      checks: [check as any],
    }],
  });

  it("rejects check paths outside the object (they are RELATIVE)", () => {
    const def = withCheck({ assert: { path: ["o", "a"], op: "notEmpty" }, target: "a", error: "e" });
    expect(lint(def, "error")).toEqual([expect.stringContaining('["o","a"] does not resolve')]);
  });

  it("rejects a target that is not a child", () => {
    const def = withCheck({ assert: { path: ["a"], op: "notEmpty" }, target: "ghost", error: "e" });
    expect(lint(def, "error")).toEqual([expect.stringContaining('target "ghost" is not a child')]);
  });

  it("warns on a missing target (the error would render nowhere)", () => {
    const def = withCheck({ assert: { path: ["a"], op: "notEmpty" }, error: "e" });
    expect(lint(def, "warning")).toEqual([expect.stringContaining("no control renders")]);
  });
});

describe("affects", () => {
  const base: FormDefinition["fields"] = [
    { name: "a", kind: "string" },
    { name: "lines", kind: "array", item: { name: "line", kind: "object", fields: [{ name: "qty", kind: "number" }] } },
    { name: "o", kind: "object", fields: [{ name: "x", kind: "string" }] },
  ];

  it("rejects targets addressing array rows or fields inside arrays", () => {
    const def: FormDefinition = {
      id: "x", fields: base,
      affects: [
        { effect: "hide", when: { path: ["a"], op: "truthy" }, targets: [["lines", 0, "qty"]] },
        { effect: "hide", when: { path: ["a"], op: "truthy" }, targets: [["lines", "qty"]] },
      ],
    };
    const errors = lint(def, "error");
    expect(errors[0]).toContain("cannot target rows");
    expect(errors[1]).toContain("inside an array item");
  });

  it("rejects unresolvable and object targets, allows array fields themselves", () => {
    const def: FormDefinition = {
      id: "x", fields: base,
      affects: [
        { effect: "hide", when: { path: ["a"], op: "truthy" }, targets: [["ghost"], ["o"], ["lines"], ["o", "x"]] },
      ],
    };
    const errors = lint(def, "error");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('["ghost"] does not resolve');
    expect(errors[1]).toContain("is an object — target its leaf fields");
  });

  it("rejects unresolvable condition paths but allows row-indexed reads", () => {
    const def: FormDefinition = {
      id: "x", fields: base,
      affects: [
        { effect: "hide", when: { and: [{ path: ["lines", 0, "qty"], op: "gt", value: 1 }, { path: ["ghost"], op: "truthy" }] }, targets: [["a"]] },
      ],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining('["ghost"] does not resolve')]);
  });

  it("rejects a populate trigger or allow entry that resolves to nothing", () => {
    const def: FormDefinition = {
      id: "x", fields: base,
      affects: [{ effect: "populate", trigger: ["ghost"], source: "s", allow: ["a", "nope", "o.x"] }],
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining('trigger ["ghost"] does not resolve'));
    expect(errors).toContainEqual(expect.stringContaining('allow lists unknown field "nope"'));
  });
});

describe("layout", () => {
  it("warns on unknown or non-renderable references", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{ name: "a", kind: "string" }, { name: "o", kind: "object", fields: [] }],
      layout: [{ type: "field", name: "ghost" }, { type: "field", name: "o" }],
    };
    const warnings = lint(def, "warning");
    expect(warnings[0]).toContain('unknown field "ghost"');
    expect(warnings[1]).toContain('object field "o"');
  });

  it("rejects duplicate section ids, including a colliding orphanSection id", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{ name: "a", kind: "string" }],
      layout: [
        { type: "section", id: "s", title: "S1", children: [] },
        { type: "section", id: "s", title: "S2", children: [{ type: "section", id: "other", title: "N", children: [] }] },
      ],
      orphanSection: { title: "O", id: "other" },
    };
    const errors = lint(def, "error");
    expect(errors).toContainEqual(expect.stringContaining('section id "s" is used 2 times'));
    expect(errors).toContainEqual(expect.stringContaining('section id "other" is used 2 times'));
  });

  it("rejects unresolvable visibleWhen paths", () => {
    const def: FormDefinition = {
      id: "x",
      fields: [{ name: "a", kind: "string" }],
      layout: [{ type: "section", id: "s", title: "S", visibleWhen: { path: ["ghost"], op: "truthy" }, children: [] }],
    };
    expect(lint(def, "error")).toEqual([expect.stringContaining('["ghost"] does not resolve')]);
  });
});
