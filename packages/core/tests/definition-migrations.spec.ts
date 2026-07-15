import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrateDefinition } from "~/lib/definition-migrations";
import type { FormDefinition } from "~/types";

describe("migrateDefinition", () => {
  it("passes a versionless definition through untouched (grandfathered as v1)", () => {
    const def: FormDefinition = { id: "x", fields: [] };
    expect(migrateDefinition(def)).toBe(def);
  });

  it("passes a current-version definition through untouched", () => {
    const def: FormDefinition = { id: "x", schemaVersion: CURRENT_SCHEMA_VERSION, fields: [] };
    expect(migrateDefinition(def)).toBe(def);
  });

  it("fails fast on definitions newer than this package supports", () => {
    const def: FormDefinition = { id: "future-form", schemaVersion: 99, fields: [] };
    expect(() => migrateDefinition(def)).toThrowError(/schemaVersion 99.*supports up to 1.*Upgrade the package/s);
  });
});
