import type { Condition } from "./condition";
import type { ValueField } from "./field";

/**
 * One node of the optional presentation tree: a field reference (by name), a
 * section grouping children under a collapsible title, or a wizard page.
 *
 * A field reference names a top-level leaf (`"email"`) or reaches through
 * object nesting with dots (`"address.city"`) — which is why field names must
 * not contain dots. Arrays cannot be referenced; they render only through
 * `DynamicFieldArray`.
 *
 * Layout is strictly visual — it never changes the submitted shape (that's
 * what object fields are for). A reference that doesn't resolve is skipped
 * with a warning rather than failing the render.
 *
 * A section is hidden when its `visibleWhen` fails OR when all of its child
 * fields are hidden by affects — an empty box never renders. Collapsing is
 * visual only: its fields stay mounted and validated.
 *
 * Pages turn the form into a multi-step wizard: one page renders at a time,
 * advancing only while the current page's fields validate. Pages may appear
 * ONLY at the top level of the layout, and then every top-level node must be
 * a page (unreferenced fields land in the last one). A page whose
 * `visibleWhen` fails is skipped in the step order.
 */
export type LayoutNode =
  | { type: "field"; name: string }
  | { type: "section"; id: string; title: string; collapsed?: boolean; visibleWhen?: Condition; children: readonly LayoutNode[] }
  | { type: "page"; id: string; title?: string; visibleWhen?: Condition; children: readonly LayoutNode[] };

/**
 * A {@link LayoutNode} resolved against the definition's fields, ready to
 * render: field nodes carry their {@link ValueField} and form path; unknown
 * names and non-renderable kinds have been dropped. Runtime-internal — never
 * appears in a definition. `path` holds one segment per object level
 * (`["address", "city"]`); it never crosses an array.
 */
export type ResolvedNode =
  | { type: "field"; name: string; path: string[]; field: ValueField }
  | { type: "section"; id: string; title: string; collapsed?: boolean; visibleWhen?: Condition;  children: ResolvedNode[] }
  | { type: "page"; id: string; title?: string; visibleWhen?: Condition; children: ResolvedNode[] }
