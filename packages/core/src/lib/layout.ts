import type { FieldDefinition, FormDefinition, LayoutNode, ResolvedNode } from "../types";
import { warn } from "./diagnostics";
import { isValueField } from "./field";

type Section = Extract<ResolvedNode, { type: "section" }>;

/**
 * The definition's layout with every unreferenced field ("orphan") appended,
 * so no field is silently unrendered. No layout → all fields flat in
 * declaration order. Orphans render bare, or inside `orphanSection` when set.
 */
export function normalizeLayout(definition: FormDefinition): readonly LayoutNode[] {
  const asFieldNode = (field: FieldDefinition): LayoutNode => ({ type: "field", name: field.name });

  if (!definition.layout) return definition.fields.map(asFieldNode);

  const referenced = collectNames(definition.layout);
  const orphans = definition.fields.filter(field => !referenced.has(field.name)).map(asFieldNode);
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

/**
 * Resolves layout nodes against the definition's fields into the tree the
 * components render. Unknown names are dropped with a warning (a typo should
 * not blank the form); object/array fields are dropped silently — they have
 * no control of their own.
 */
export function resolveNodes(
  nodes: readonly LayoutNode[],
  fieldsByName: Record<string, FieldDefinition>,
): ResolvedNode[] {
  const resolved: ResolvedNode[] = [];

  for (const node of nodes) {
    if (node.type === "section") {
      resolved.push({ ...node, children: resolveNodes(node.children, fieldsByName) });
      continue;
    }

    const field = fieldsByName[node.name];
    if (!field) {
      warn("layout", `unknown field "${node.name}"`);
      continue;
    }
    if (!isValueField(field)) continue;

    resolved.push({ type: "field", name: node.name, path: [node.name], field });
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
