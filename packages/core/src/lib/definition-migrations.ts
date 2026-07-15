import type { FormDefinition } from "../types";
import { fail } from "./diagnostics";

/** The FormDefinition format version this package understands. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Stepwise migrations: the entry at key N migrates a definition FROM version N
 * TO version N + 1. Inputs are deliberately untyped — only this file ever knows
 * about old shapes; the rest of the codebase works against the latest
 * FormDefinition type only.
 *
 * Rules:
 * - Append-only. Once a migration ships, never edit it — stored definitions
 *   depend on its exact behavior. Fix mistakes with a new version.
 * - A migration may only derive the new shape from the old one plus defaults.
 *   Keep a frozen fixture of each released version and test the chain end-to-end.
 */
const migrations: Record<number, (def: any) => any> = {
  // 1: (def) => ({ ...def, /* v1 -> v2 */ }),
};

/**
 * Migrates a raw definition (any released version) to the current shape.
 * Missing `schemaVersion` means 1, so all pre-versioning definitions are
 * grandfathered. Throws on versions newer than this package supports —
 * migrations only go up, never down.
 */
export function migrateDefinition(raw: FormDefinition): FormDefinition {
  let definition: any = raw;
  let version: number = definition.schemaVersion ?? 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    fail("definition",
      `definition "${definition.id}" uses schemaVersion ${version}, but this package ` +
      `supports up to ${CURRENT_SCHEMA_VERSION}. Upgrade the package.`);
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      fail("definition",
        `no migration registered for schemaVersion ${version} — cannot reach ${CURRENT_SCHEMA_VERSION}.`);
    }

    definition = migrate(definition);
    version++;
    definition.schemaVersion = version;
  }

  return definition as FormDefinition;
}
