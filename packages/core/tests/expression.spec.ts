import { describe, expect, it } from "vitest";
import { evalExpression } from "~/lib/expression";
import type { Expression, PathKey } from "~/types";

const readFrom = (data: Record<string, unknown>) => (p: readonly PathKey[]) => data[p[0] as string];
const noRead = () => undefined;

describe("evalExpression", () => {
  it("returns constants and reads refs", () => {
    expect(evalExpression({ const: 42 }, noRead)).toBe(42);
    expect(evalExpression({ ref: ["qty"] }, readFrom({ qty: 7 }))).toBe(7);
  });

  it("concats with separator, treating nullish as empty string", () => {
    const expr: Expression = { op: "concat", sep: " ", args: [{ ref: ["a"] }, { ref: ["b"] }] };
    expect(evalExpression(expr, readFrom({ a: "Alice", b: "Doe" }))).toBe("Alice Doe");
    expect(evalExpression(expr, readFrom({ a: "Alice" }))).toBe("Alice ");
  });

  describe("coalesce (regression: early-return-in-loop bug)", () => {
    it("returns the first non-empty argument, not just inspecting the first", () => {
      const expr: Expression = { op: "coalesce", args: [{ ref: ["missing"] }, { const: "" }, { const: "x" }] };
      expect(evalExpression(expr, noRead)).toBe("x");
    });

    it("returns undefined when every argument is empty", () => {
      const expr: Expression = { op: "coalesce", args: [{ const: undefined }, { const: "" }, { const: null }] };
      expect(evalExpression(expr, noRead)).toBeUndefined();
    });

    it("returns undefined for empty args instead of falling through to arithmetic", () => {
      expect(() => evalExpression({ op: "coalesce", args: [] }, noRead)).not.toThrow();
      expect(evalExpression({ op: "coalesce", args: [] }, noRead)).toBeUndefined();
    });
  });

  it("computes arithmetic chains", () => {
    expect(evalExpression({ op: "mul", args: [{ const: 12 }, { const: 48 }] }, noRead)).toBe(576);
    expect(evalExpression({ op: "add", args: [{ const: 1 }, { const: 2 }, { const: 3 }] }, noRead)).toBe(6);
    expect(evalExpression({ op: "sub", args: [{ const: 10 }, { const: 4 }] }, noRead)).toBe(6);
    expect(evalExpression({ op: "div", args: [{ const: 100 }, { const: 2 }, { const: 5 }] }, noRead)).toBe(10);
  });

  it("computes min and max", () => {
    expect(evalExpression({ op: "min", args: [{ const: 3 }, { const: 1 }, { const: 2 }] }, noRead)).toBe(1);
    expect(evalExpression({ op: "max", args: [{ const: 3 }, { const: 1 }, { const: 2 }] }, noRead)).toBe(3);
  });

  it("rounds with and without precision", () => {
    expect(evalExpression({ op: "round", args: [{ const: 3.14159 }], precision: 2 }, noRead)).toBe(3.14);
    expect(evalExpression({ op: "round", args: [{ const: 3.6 }] }, noRead)).toBe(4);
  });

  describe("lookup", () => {
    const table = { adult: 49, student: 25, child: 10 };

    it("yields the table entry for the key", () => {
      const expr: Expression = { op: "lookup", on: { ref: ["ticket"] }, table };
      expect(evalExpression(expr, readFrom({ ticket: "student" }))).toBe(25);
    });

    it("coerces a non-string key to its string form", () => {
      const expr: Expression = { op: "lookup", on: { ref: ["floor"] }, table: { "3": "third" } };
      expect(evalExpression(expr, readFrom({ floor: 3 }))).toBe("third");
    });

    it("composes: a concat key and an expression default", () => {
      const expr: Expression = {
        op: "lookup",
        on: { op: "concat", sep: "-", args: [{ ref: ["size"] }, { ref: ["color"] }] },
        table: { "M-OCN": 31 },
        default: { ref: ["basePrice"] },
      };
      expect(evalExpression(expr, readFrom({ size: "M", color: "OCN" }))).toBe(31);
      expect(evalExpression(expr, readFrom({ size: "S", color: "BLK", basePrice: 29 }))).toBe(29);
    });

    it("yields the default on a miss, undefined without one", () => {
      const withDefault: Expression = { op: "lookup", on: { ref: ["ticket"] }, table, default: { const: 0 } };
      expect(evalExpression(withDefault, readFrom({ ticket: "vip" }))).toBe(0);

      const bare: Expression = { op: "lookup", on: { ref: ["ticket"] }, table };
      expect(evalExpression(bare, readFrom({ ticket: "vip" }))).toBeUndefined();
    });

    it("treats an empty key as a miss — it must not stringify to a real key", () => {
      const expr: Expression = { op: "lookup", on: { ref: ["missing"] }, table: { undefined: "gotcha" }, default: { const: "fallback" } };
      expect(evalExpression(expr, noRead)).toBe("fallback");
    });

    it("only matches the table's own entries — form data cannot reach the prototype", () => {
      const expr: Expression = { op: "lookup", on: { ref: ["key"] }, table };
      expect(evalExpression(expr, readFrom({ key: "constructor" }))).toBeUndefined();
      expect(evalExpression(expr, readFrom({ key: "__proto__" }))).toBeUndefined();
    });
  });

  describe("dateDiff", () => {
    it("counts whole days", () => {
      const expr: Expression = { op: "dateDiff", unit: "days", args: [{ const: "2025-01-01" }, { const: "2025-01-11" }] };
      expect(evalExpression(expr, noRead)).toBe(10);
    });

    it("counts years calendar-aware (birthday not yet reached)", () => {
      const before: Expression = { op: "dateDiff", unit: "years", args: [{ const: "1996-06-10" }, { const: "2026-06-09" }] };
      const onDay: Expression = { op: "dateDiff", unit: "years", args: [{ const: "1996-06-10" }, { const: "2026-06-10" }] };
      expect(evalExpression(before, noRead)).toBe(29);
      expect(evalExpression(onDay, noRead)).toBe(30);
    });

    it("counts months calendar-aware", () => {
      const full: Expression = { op: "dateDiff", unit: "month", args: [{ const: "2025-01-15" }, { const: "2025-03-15" }] };
      const short: Expression = { op: "dateDiff", unit: "month", args: [{ const: "2025-01-15" }, { const: "2025-03-14" }] };
      expect(evalExpression(full, noRead)).toBe(2);
      expect(evalExpression(short, noRead)).toBe(1);
    });

    it("returns undefined for unparseable dates", () => {
      const expr: Expression = { op: "dateDiff", unit: "days", args: [{ const: "nope" }, { const: "2025-01-01" }] };
      expect(evalExpression(expr, noRead)).toBeUndefined();
    });
  });

  it("evaluates now to a Date", () => {
    expect(evalExpression({ op: "now" }, noRead)).toBeInstanceOf(Date);
  });

  it("branches on if using the Condition evaluator", () => {
    const expr: Expression = { if: { path: ["x"], op: "truthy" }, then: { const: "yes" }, else: { const: "no" } };
    expect(evalExpression(expr, readFrom({ x: 1 }))).toBe("yes");
    expect(evalExpression(expr, readFrom({ x: 0 }))).toBe("no");
  });
});
