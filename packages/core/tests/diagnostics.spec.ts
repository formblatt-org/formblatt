import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError, setDiagnosticsHandler, warn, type Diagnostic } from "~/lib/diagnostics";

afterEach(() => setDiagnosticsHandler(undefined));

describe("setDiagnosticsHandler", () => {
  it("routes warns and errors through the handler instead of the console", () => {
    const seen: Diagnostic[] = [];
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setDiagnosticsHandler(diagnostic => seen.push(diagnostic));

    warn("layout", "unknown field");
    const cause = new Error("boom");
    reportError("options", "source failed", cause);

    expect(seen).toEqual([
      { level: "warn", scope: "layout", message: "unknown field" },
      { level: "error", scope: "options", message: "source failed", cause },
    ]);
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it("restores console logging when the handler is cleared", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setDiagnosticsHandler(() => {});
    setDiagnosticsHandler(undefined);

    warn("form", "back to the console");

    expect(consoleWarn).toHaveBeenCalledWith("[formblatt/form] back to the console");
    consoleWarn.mockRestore();
  });
});
