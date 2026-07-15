/**
 * The subsystem a diagnostic came from — rendered as `[formblatt/<scope>]`,
 * so a console filter of `formblatt/` catches everything the engine reports.
 */
export type DiagnosticScope =
  | "form"
  | "definition"
  | "layout"
  | "field"
  | "field-array"
  | "section"
  | "affects"
  | "options"
  | "populate"
  | "computed";

const prefix = (scope: DiagnosticScope) => `[formblatt/${scope}]`;

/** Reports a recoverable problem the engine renders around (unknown field, missing resolver). */
export function warn(scope: DiagnosticScope, message: string): void {
  console.warn(`${prefix(scope)} ${message}`);
}

/** Reports a failed host callback (a rejected resolver promise), with its cause. */
export function reportError(scope: DiagnosticScope, message: string, cause: unknown): void {
  console.error(`${prefix(scope)} ${message}`, cause);
}

/** Throws a scoped error — for contract violations the engine cannot render around. */
export function fail(scope: DiagnosticScope, message: string): never {
  throw new Error(`${prefix(scope)} ${message}`);
}
