import { describe, expect, it, vi } from "vitest";
import { collectNames, directFieldNames, findSection, normalizeLayout, resolveNodes } from "~/lib/layout";
import type { FieldDefinition, FormDefinition, LayoutNode, ResolvedNode } from "~/types";

const fields: FieldDefinition[] = [
  { name: "a", kind: "string" },
  { name: "b", kind: "string" },
  { name: "c", kind: "string" },
];

const nested: FieldDefinition[] = [
  { name: "email", kind: "string" },
  {
    name: "address", kind: "object", fields: [
      { name: "city", kind: "string" },
      { name: "zip", kind: "string" },
    ],
  },
  { name: "lines", kind: "array", item: { name: "line", kind: "string" } },
];

describe("normalizeLayout", () => {
  it("renders all fields flat when there is no layout", () => {
    const def: FormDefinition = { id: "x", fields };
    expect(normalizeLayout(def)).toEqual([
      { type: "field", name: "a" },
      { type: "field", name: "b" },
      { type: "field", name: "c" },
    ]);
  });

  it("flattens object fields into dotted leaf references and skips arrays", () => {
    const def: FormDefinition = { id: "x", fields: nested };
    expect(normalizeLayout(def)).toEqual([
      { type: "field", name: "email" },
      { type: "field", name: "address.city" },
      { type: "field", name: "address.zip" },
    ]);
  });

  it("appends unreferenced fields as bare orphans at the end", () => {
    const def: FormDefinition = {
      id: "x", fields,
      layout: [{ type: "section", id: "s", title: "S", children: [{ type: "field", name: "a" }] }],
    };
    const nodes = normalizeLayout(def);
    expect(nodes.slice(1)).toEqual([{ type: "field", name: "b" }, { type: "field", name: "c" }]);
  });

  it("treats an unreferenced object leaf as an orphan, not the whole object", () => {
    const def: FormDefinition = {
      id: "x", fields: nested,
      layout: [{ type: "field", name: "email" }, { type: "field", name: "address.city" }],
    };
    expect(normalizeLayout(def).slice(2)).toEqual([{ type: "field", name: "address.zip" }]);
  });

  it("wraps orphans in a section when orphanSection is configured", () => {
    const def: FormDefinition = {
      id: "x", fields,
      layout: [{ type: "field", name: "a" }],
      orphanSection: { title: "Other" },
    };
    const nodes = normalizeLayout(def);
    expect(nodes[1]).toMatchObject({
      type: "section", id: "__orphans", title: "Other",
      children: [{ type: "field", name: "b" }, { type: "field", name: "c" }],
    });
  });

  it("returns the layout untouched when it covers every leaf (no empty orphan section)", () => {
    const layout: LayoutNode[] = [
      { type: "field", name: "a" }, { type: "field", name: "b" }, { type: "field", name: "c" },
    ];
    const def: FormDefinition = { id: "x", fields, layout, orphanSection: { title: "Other" } };
    expect(normalizeLayout(def)).toBe(layout);
  });
});

describe("resolveNodes", () => {
  it("resolves fields with their path and definition, recursing into sections", () => {
    const nodes: LayoutNode[] = [
      { type: "field", name: "a" },
      { type: "section", id: "s", title: "S", children: [{ type: "field", name: "b" }] },
    ];
    const resolved = resolveNodes(nodes, fields);
    expect(resolved[0]).toMatchObject({ type: "field", name: "a", path: ["a"] });
    expect(resolved[1]).toMatchObject({ type: "section", id: "s" });
    expect((resolved[1] as any).children[0]).toMatchObject({ type: "field", name: "b", path: ["b"] });
  });

  it("resolves dotted names through object nesting with the full path", () => {
    const resolved = resolveNodes([{ type: "field", name: "address.city" }], nested);
    expect(resolved[0]).toMatchObject({
      type: "field", name: "address.city", path: ["address", "city"],
    });
    expect((resolved[0] as any).field.name).toBe("city");
  });

  it("skips unknown fields and non-value kinds, each with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resolved = resolveNodes(
      [
        { type: "field", name: "ghost" },
        { type: "field", name: "lines" },
        { type: "field", name: "address" },
        { type: "field", name: "email" },
      ],
      nested,
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ name: "email" });
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("does not resolve names through an array boundary", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveNodes([{ type: "field", name: "lines.line" }], nested)).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("tree helpers", () => {
  const tree: ResolvedNode[] = [
    { type: "field", name: "a", path: ["a"], field: fields[0] as any },
    {
      type: "section", id: "outer", title: "O", children: [
        { type: "field", name: "b", path: ["b"], field: fields[1] as any },
        { type: "section", id: "inner", title: "I", children: [] },
      ],
    },
  ];

  it("findSection locates nested sections by id", () => {
    expect(findSection(tree, "outer")?.title).toBe("O");
    expect(findSection(tree, "inner")?.title).toBe("I");
    expect(findSection(tree, "missing")).toBeUndefined();
  });

  it("directFieldNames stays shallow (sections register their own children)", () => {
    expect(directFieldNames(tree)).toEqual(["a"]);
  });

  it("collectNames descends the whole layout tree", () => {
    const layout: LayoutNode[] = [
      { type: "field", name: "a" },
      { type: "section", id: "s", title: "S", children: [{ type: "field", name: "b" }] },
    ];
    expect([...collectNames(layout)]).toEqual(["a", "b"]);
  });
});
