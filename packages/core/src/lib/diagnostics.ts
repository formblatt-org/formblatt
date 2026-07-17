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

/** One recoverable problem the engine reported, as a handler receives it. */
export interface Diagnostic {
  /** `warn` for render-around problems, `error` for failed host callbacks. */
  level: "warn" | "error";
  scope: DiagnosticScope;
  message: string;
  /** The underlying failure (a rejected resolver's reason) — `error` level only. */
  cause?: unknown;
}

/** Where diagnostics go instead of the console. See {@link setDiagnosticsHandler}. */
export type DiagnosticsHandler = (diagnostic: Diagnostic) => void;

let handler: DiagnosticsHandler | undefined;

/**
 * Routes every {@link warn} / {@link reportError} through `next` instead of
 * the console — the telemetry hook (Sentry, Datadog, a test sink). Module-wide:
 * set it once at app start. Pass `undefined` to restore console logging.
 * Contract-violation throws ({@link fail}) are not diagnostics and stay throws.
 */
export function setDiagnosticsHandler(next: DiagnosticsHandler | undefined): void {
  handler = next;
}

const prefix = (scope: DiagnosticScope) => `[formblatt/${scope}]`;

/** Reports a recoverable problem the engine renders around (unknown field, missing resolver). */
export function warn(scope: DiagnosticScope, message: string): void {
  if (handler) return handler({ level: "warn", scope, message });
  console.warn(`${prefix(scope)} ${message}`);
}

/** Reports a failed host callback (a rejected resolver promise), with its cause. */
export function reportError(scope: DiagnosticScope, message: string, cause: unknown): void {
  if (handler) return handler({ level: "error", scope, message, cause });
  console.error(`${prefix(scope)} ${message}`, cause);
}

/** Throws a scoped error — for contract violations the engine cannot render around. */
export function fail(scope: DiagnosticScope, message: string): never {
  throw new Error(`${prefix(scope)} ${message}`);
}
