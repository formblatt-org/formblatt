import type { Affect } from "./affect";
import type { FieldDefinition } from "./field";
import type { LayoutNode } from "./layout";

/**
 * The wire contract: one complete form as served by a backend. Everything the
 * engine does — validation schema, visibility, populate, dynamic options,
 * computed values, layout — derives from this single document.
 *
 * Definitions arriving as JSON should pass through `migrateDefinition` and
 * then `validateDefinition`; the Vue `DynamicForm` does both automatically.
 */
export interface FormDefinition {
  /**
   * Version of the FormDefinition FORMAT (not of the form — that's `id`).
   * Missing means 1; bumped only on breaking shape changes.
   * See lib/definition-migrations.ts.
   */
  schemaVersion?: number;
  /**
   * The form's identity. Also the natural `:key` for remounting the form
   * component — the store is built once per mount and does not react to
   * definition changes.
   */
  id: string;
  /**
   * When the first validation runs. Defaults to `"submit"`. `"initial"` makes
   * `isValid` accurate from the start — pair it with touched-gated error
   * display to avoid showing errors before the user interacts.
   */
  validate?: "submit" | "input" | "change" | "blur" | "touch" | "initial";
  /** When validation re-runs after the first one. Defaults to `"input"`. */
  revalidate?: "submit" | "input" | "change" | "blur" | "touch";
  /**
   * The flat data contract: every field, in declaration order — the single
   * source of truth for the submitted shape and for validation.
   * {@link layout} only arranges presentation.
   */
  fields: readonly FieldDefinition[];
  /** Interaction rules: visibility and populate. See {@link Affect}. */
  affects?: readonly Affect[];
  /**
   * Optional presentation tree. Omitted → all fields render flat in
   * declaration order; fields it doesn't reference are appended at the end.
   * See {@link LayoutNode}.
   */
  layout?: readonly LayoutNode[];
  /**
   * Wraps orphan fields (in {@link fields} but not referenced by
   * {@link layout}) in a titled section; omit to render them bare at the end.
   * An empty section never renders.
   */
  orphanSection?: { title: string; id?: string; collapsed?: boolean }
}
