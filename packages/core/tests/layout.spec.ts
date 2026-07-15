import { describe, expect, it, vi } from "vitest";
import { collectNames, directFieldNames, findSection, normalizeLayout, resolveNodes } from "~/lib/layout";
import type { FieldDefinition, FormDefinition, LayoutNode, ResolvedNode } from "~/types";

const fields: FieldDefinition[] = [
  { name: "a", kind: "string" },
  { name: "b", kind: "string" },
  { name: "c", kind: "string" },
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

  it("appends unreferenced fields as bare orphans at the end", () => {
    const def: FormDefinition = {
      id: "x", fields,
      layout: [{ type: "section", id: "s", title: "S", children: [{ type: "field", name: "a" }] }],
    };
    const nodes = normalizeLayout(def);
    expect(nodes.slice(1)).toEqual([{ type: "field", name: "b" }, { type: "field", name: "c" }]);
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

  it("returns the layout untouched when it covers every field (no empty orphan section)", () => {
    const layout: LayoutNode[] = [
      { type: "field", name: "a" }, { type: "field", name: "b" }, { type: "field", name: "c" },
    ];
    const def: FormDefinition = { id: "x", fields, layout, orphanSection: { title: "Other" } };
    expect(normalizeLayout(def)).toBe(layout);
  });
});

describe("resolveNodes", () => {
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));

  it("resolves fields with their path and definition, recursing into sections", () => {
    const nodes: LayoutNode[] = [
      { type: "field", name: "a" },
      { type: "section", id: "s", title: "S", children: [{ type: "field", name: "b" }] },
    ];
    const resolved = resolveNodes(nodes, byName);
    expect(resolved[0]).toMatchObject({ type: "field", name: "a", path: ["a"] });
    expect(resolved[1]).toMatchObject({ type: "section", id: "s" });
    expect((resolved[1] as any).children[0]).toMatchObject({ type: "field", name: "b", path: ["b"] });
  });

  it("skips unknown fields with a warning and non-value kinds silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const withArray = { ...byName, arr: { name: "arr", kind: "array", item: { name: "i", kind: "string" } } as FieldDefinition };
    const resolved = resolveNodes(
      [{ type: "field", name: "ghost" }, { type: "field", name: "arr" }, { type: "field", name: "a" }],
      withArray
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ name: "a" });
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
