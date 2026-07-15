import type { Condition } from "./condition";
import type { ValueField } from "./field";

/**
 * One node of the optional presentation tree: a field reference (by name) or
 * a section grouping children under a collapsible title.
 *
 * Layout is strictly visual — it never changes the submitted shape (that's
 * what object fields are for). A referenced name that doesn't exist is
 * skipped with a warning rather than failing the render.
 *
 * A section is hidden when its `visibleWhen` fails OR when all of its child
 * fields are hidden by affects — an empty box never renders. Collapsing is
 * visual only: its fields stay mounted and validated.
 */
export type LayoutNode =
  | { type: "field"; name: string }
  | { type: "section"; id: string; title: string; collapsed?: boolean; visibleWhen?: Condition; children: readonly LayoutNode[] };

/**
 * A {@link LayoutNode} resolved against the definition's fields, ready to
 * render: field nodes carry their {@link ValueField} and form path; unknown
 * names and non-renderable kinds have been dropped. Runtime-internal — never
 * appears in a definition. `path` is single-segment because layout can only
 * reference top-level fields.
 */
export type ResolvedNode =
  | { type: "field"; name: string; path: [string]; field: ValueField }
  | { type: "section"; id: string; title: string; collapsed?: boolean; visibleWhen?: Condition;  children: ResolvedNode[] }
