import type { FieldDefinition, FormDefinition, LayoutNode, ResolvedNode } from "../types";
import { warn } from "./diagnostics";
import { resolveFieldByNamePath, walkValueFields } from "./field";

type Section = Extract<ResolvedNode, { type: "section" }>;

/**
 * The definition's layout with every unreferenced leaf ("orphan") appended,
 * so no field is silently unrendered. No layout → every leaf value field flat
 * in declaration order, object fields flattened into dotted references
 * (`"address.city"`); arrays are skipped — they render only through
 * `DynamicFieldArray`. Orphans render bare, or inside `orphanSection` when set.
 */
export function normalizeLayout(definition: FormDefinition): readonly LayoutNode[] {
  if (!definition.layout) return flattenFields(definition.fields);

  const referenced = collectNames(definition.layout);
  const orphans = flattenFields(definition.fields).filter(node => !referenced.has(node.name));
  if (!orphans.length) return definition.layout;

  const { orphanSection } = definition;
  if (!orphanSection) return [...definition.layout, ...orphans];

  return [...definition.layout, {
    type: "section",
    id: orphanSection.id ?? "__orphans",
    title: orphanSection.title,
    collapsed: orphanSection.collapsed,
    children: orphans,
  }];
}

type FieldNode = Extract<LayoutNode, { type: "field" }>;

/** One field node per leaf value field, object leaves referenced by dotted name. */
function flattenFields(fields: readonly FieldDefinition[]): FieldNode[] {
  return walkValueFields(fields).map(entry => ({ type: "field", name: entry.path.join(".") }));
}

/**
 * Resolves layout nodes against the definition's fields into the tree the
 * components render. A dotted name reaches through object nesting
 * (`"address.city"`). Unresolvable nodes are dropped with a warning (a typo
 * should not blank the form) — including object/array references, which have
 * no control of their own.
 */
export function resolveNodes(
  nodes: readonly LayoutNode[],
  fields: readonly FieldDefinition[],
): ResolvedNode[] {
  const resolved: ResolvedNode[] = [];

  for (const node of nodes) {
    if (node.type === "section") {
      resolved.push({ ...node, children: resolveNodes(node.children, fields) });
      continue;
    }

    const path = node.name.split(".");
    const field = resolveFieldByNamePath(fields, path);
    if (!field) {
      warn("layout", `unknown field "${node.name}"`);
      continue;
    }
    if (field.kind === "object") {
      warn("layout", `"${node.name}" is an object field — reference its leaves ("${node.name}.<child>") instead`);
      continue;
    }
    if (field.kind === "array") {
      warn("layout", `"${node.name}" is an array field — arrays render through DynamicFieldArray, not the layout`);
      continue;
    }

    resolved.push({ type: "field", name: node.name, path, field });
  }

  return resolved;
}

/** Every field name the layout tree references, at any depth. */
export function collectNames(nodes: readonly LayoutNode[], names = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.type === "field") names.add(node.name);
    else collectNames(node.children, names);
  }
  return names;
}

/** Finds a section by id anywhere in a resolved tree. */
export function findSection(nodes: readonly ResolvedNode[], id: string): Section | undefined {
  for (const node of nodes) {
    if (node.type !== "section") continue;
    if (node.id === id) return node;

    const nested = findSection(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Field names placed *directly* by these nodes, for coverage tracking.
 * Does not descend into sections — those register their own fields.
 */
export function directFieldNames(nodes: readonly ResolvedNode[]): string[] {
  return nodes.filter(node => node.type === "field").map(node => node.name);
}
