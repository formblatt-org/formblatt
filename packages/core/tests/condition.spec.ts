import { describe, expect, it } from "vitest";
import { evaluate, isEmpty } from "~/lib/condition";
import type { Condition, PathKey } from "~/types";

const readFrom = (data: Record<string, unknown>) => (p: readonly PathKey[]) => data[p[0] as string];

const truthy = (cond: Condition, data: Record<string, unknown>) => evaluate(cond, readFrom(data));

describe("evaluate", () => {
  it("treats an absent condition as true", () => {
    expect(evaluate(undefined, () => undefined)).toBe(true);
  });

  it("compares eq / ne strictly", () => {
    expect(truthy({ path: ["a"], op: "eq", value: "x" }, { a: "x" })).toBe(true);
    expect(truthy({ path: ["a"], op: "eq", value: "x" }, { a: "y" })).toBe(false);
    expect(truthy({ path: ["a"], op: "ne", value: "x" }, { a: "y" })).toBe(true);
  });

  it("handles in / nin, returning false for a non-array value", () => {
    expect(truthy({ path: ["a"], op: "in", value: ["x", "y"] }, { a: "x" })).toBe(true);
    expect(truthy({ path: ["a"], op: "nin", value: ["x", "y"] }, { a: "z" })).toBe(true);
    expect(truthy({ path: ["a"], op: "in", value: "not-an-array" }, { a: "x" })).toBe(false);
  });

  it("handles truthy / falsy", () => {
    expect(truthy({ path: ["a"], op: "truthy" }, { a: 1 })).toBe(true);
    expect(truthy({ path: ["a"], op: "falsy" }, { a: 0 })).toBe(true);
  });

  it("treats null, undefined and '' as empty — but not 0", () => {
    expect(truthy({ path: ["a"], op: "empty" }, { a: "" })).toBe(true);
    expect(truthy({ path: ["a"], op: "empty" }, { a: null })).toBe(true);
    expect(truthy({ path: ["a"], op: "empty" }, {})).toBe(true);
    expect(truthy({ path: ["a"], op: "empty" }, { a: 0 })).toBe(false);
    expect(truthy({ path: ["a"], op: "notEmpty" }, { a: 0 })).toBe(true);
  });

  it("compares numbers with correct boundaries (gte/lte)", () => {
    expect(truthy({ path: ["q"], op: "gte", value: 10 }, { q: 10 })).toBe(true);
    expect(truthy({ path: ["q"], op: "gte", value: 10 }, { q: 9 })).toBe(false);
    expect(truthy({ path: ["q"], op: "lte", value: 20 }, { q: 20 })).toBe(true);
    expect(truthy({ path: ["q"], op: "lte", value: 20 }, { q: 21 })).toBe(false);
    expect(truthy({ path: ["q"], op: "gt", value: 10 }, { q: 10 })).toBe(false);
    expect(truthy({ path: ["q"], op: "lt", value: 10 }, { q: 10 })).toBe(false);
  });

  it("combines with and / or / not", () => {
    const a: Condition = { path: ["a"], op: "eq", value: 1 };
    const b: Condition = { path: ["b"], op: "eq", value: 2 };
    expect(truthy({ and: [a, b] }, { a: 1, b: 2 })).toBe(true);
    expect(truthy({ and: [a, b] }, { a: 1, b: 3 })).toBe(false);
    expect(truthy({ or: [a, b] }, { a: 0, b: 2 })).toBe(true);
    expect(truthy({ not: a }, { a: 1 })).toBe(false);
    expect(truthy({ not: { and: [a, b] } }, { a: 1, b: 3 })).toBe(true);
  });
});

describe("isEmpty", () => {
  it("matches the required-check semantics", () => {
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty("")).toBe(true);
    expect(isEmpty(0)).toBe(false);
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty("x")).toBe(false);
  });
});
