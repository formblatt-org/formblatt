import type { Expression } from "../types";
import { evaluate, isEmpty, type ValueReader } from "./condition";

type ArithmeticOperator = "add" | "sub" | "mul" | "div";
type DateDiffExpression = Extract<Expression, { op: "dateDiff" }>;
type LookupExpression = Extract<Expression, { op: "lookup" }>;

const MS_PER_DAY = 86_400_000;

const ARITHMETIC: Record<ArithmeticOperator, (left: number, right: number) => number> = {
  add: (left, right) => left + right,
  sub: (left, right) => left - right,
  mul: (left, right) => left * right,
  div: (left, right) => left / right,
};

/**
 * Evaluates an {@link Expression} against form data, synchronously.
 * Missing refs flow through as `NaN` (arithmetic) or `""` (concat); writers
 * convert `NaN` to `undefined` at the store boundary. `read` resolves `ref`
 * paths — absolute at the top level, row-relative inside array items.
 */
export function evalExpression(expression: Expression, read: ValueReader): unknown {
  if ("const" in expression) return expression.const;
  if ("ref" in expression) return read(expression.ref);
  if ("if" in expression) {
    return evaluate(expression.if, read)
      ? evalExpression(expression.then, read)
      : evalExpression(expression.else, read);
  }

  switch (expression.op) {
    case "concat":
      return expression.args
        .map(arg => String(evalExpression(arg, read) ?? ""))
        .join(expression.sep ?? "");

    case "coalesce":
      return firstNonEmpty(expression.args, read);

    // no seed value: `args` must be non-empty, as the Expression docs state
    case "add":
    case "sub":
    case "mul":
    case "div":
      return evalNumbers(expression.args, read).reduce(ARITHMETIC[expression.op]);

    case "min":
      return Math.min(...evalNumbers(expression.args, read));

    case "max":
      return Math.max(...evalNumbers(expression.args, read));

    case "round": {
      const factor = 10 ** (expression.precision ?? 0);
      return Math.round(Number(evalExpression(expression.args[0], read)) * factor) / factor;
    }

    case "dateDiff":
      return dateDiff(expression, read);

    case "lookup":
      return lookup(expression, read);

    case "now":
      return new Date();
  }
}

/**
 * The `on` key's table entry; `default` (or `undefined`) for an empty key or
 * a miss. `Object.hasOwn` because the key is form data: a user typing
 * "constructor" must miss, not dredge up the prototype.
 */
function lookup(expression: LookupExpression, read: ValueReader): unknown {
  const key = evalExpression(expression.on, read);
  if (!isEmpty(key) && Object.hasOwn(expression.table, String(key))) {
    return expression.table[String(key)];
  }
  return expression.default ? evalExpression(expression.default, read) : undefined;
}

/** The first argument that is neither nullish nor `""`, or `undefined` if all are. */
function firstNonEmpty(args: readonly Expression[], read: ValueReader): unknown {
  for (const arg of args) {
    const value = evalExpression(arg, read);
    if (!isEmpty(value)) return value;
  }
  return undefined;
}

/** Evaluates every argument and coerces each to a number (missing refs become `NaN`). */
function evalNumbers(args: readonly Expression[], read: ValueReader): number[] {
  return args.map(arg => Number(evalExpression(arg, read)));
}

/** Whole units from the first date to the second; `undefined` if either is unparseable. */
function dateDiff(expression: DateDiffExpression, read: ValueReader): number | undefined {
  const from = toDate(evalExpression(expression.args[0], read));
  const to = toDate(evalExpression(expression.args[1], read));
  if (!from || !to) return undefined;

  switch (expression.unit ?? "days") {
    case "days": return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
    case "month": return wholeMonthsBetween(from, to);
    case "years": return wholeYearsBetween(from, to);
  }
}

function toDate(value: unknown): Date | undefined {
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Calendar years, counted only once the anniversary day is reached. */
function wholeYearsBetween(from: Date, to: Date): number {
  const years = to.getFullYear() - from.getFullYear();
  return hasPassedAnniversary(from, to) ? years : years - 1;
}

/** Calendar months, counted only once the day-of-month is reached. */
function wholeMonthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}

/** Whether `to` has reached `from`'s month-and-day within its own year. */
function hasPassedAnniversary(from: Date, to: Date): boolean {
  const monthDelta = to.getMonth() - from.getMonth();
  if (monthDelta !== 0) return monthDelta > 0;
  return to.getDate() >= from.getDate();
}
