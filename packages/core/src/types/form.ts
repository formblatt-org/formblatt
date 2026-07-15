import { Affect } from "./affect";
import { FieldDefinition } from "./field";
import { LayoutNode } from "./layout";

/**
 * One complete form served by a backend. Everything the
 * engine does - validation schema, visibility, populate, dynamic options,
 * computed values, layout - derives from this single document.
 *
 * Definitions arriving as JSON should pass through `migrateDefinition` and
 * then `validateDefinition`.
 */
export interface FormDefinition {
  /**
   * Version of the FormDefinition format. Missing means 1.
   * Bumped only on breaking shape changes.
   */
  schemaVersion?: number;
  /**
   * The form's identity.
   */
  id: string;
  /**
   * When the first validation runs.
   */
  validate?: "submit" | "input" | "change" | "blur" | "touch" | "initial";
  /** When validation re-runs after the first one. */
  revalidate?: "submit" | "input" | "change" | "blur" | "touch";
  /**
   * The flat data contract: every field, in declaration order - the single
   * source of truth for the submitted shape and for validation.
   * {@link layout} only arranges presentation.
   */
  fields: readonly FieldDefinition[];
  /** Interaction rules: visibility and populate. See {@link Affect}. */
  affects?: readonly Affect[];
  /**
   * Optional presentation tree. Omitted -> all fields render flat in
   * declaration order. Fields that are not references are appended at the end.
   * See {@link LayoutNode}.
   */
  layout: readonly LayoutNode[];
  /**
   * Wraps orphan fields (in {@link fields} but not referenced by
   * {@link layout}) in a titled section. Omit to render them bare at the end.
   * An empty section never renders.
   */
  orphanSection?: { title: string; id?: string; collapsed?: boolean }
}
