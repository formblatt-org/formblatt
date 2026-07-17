import { describe, expect, it } from "vitest";
import { createTypedForm, defineFormDefinition, type InferFormOutput } from "../src/typed-form";

/**
 * Compile-time contract of InferFormOutput — vue-tsc fails this file when the
 * inference regresses; the runtime assertions only anchor the test to vitest.
 */
const definition = defineFormDefinition({
  id: "typed",
  fields: [
    { name: "firstName", kind: "string" },
    { name: "nickname", kind: "string", required: false },
    { name: "age", kind: "number", nullable: true },
    { name: "terms", kind: "boolean" },
    { name: "color", kind: "enum", options: [{ label: "Red", value: "red" }, { label: "Blue", value: "blue" }] },
    { name: "fullName", kind: "string", computed: { expression: { const: "" } } },
    { name: "badge", kind: "string", required: false, transient: true },
    { name: "secret", kind: "string" },
    {
      name: "address", kind: "object", fields: [
        { name: "city", kind: "string" },
        { name: "note", kind: "string", required: false },
      ],
    },
    {
      name: "lines", kind: "array", item: {
        name: "line", kind: "object", fields: [{ name: "qty", kind: "number" }],
      },
    },
  ],
  affects: [
    { effect: "show", when: { path: ["firstName"], op: "notEmpty" }, targets: [["secret"]] },
  ],
} as const);

type Output = InferFormOutput<typeof definition>;

describe("InferFormOutput", () => {
  it("types the submit payload from the definition literal", () => {
    const payload: Output = {
      firstName: "Ada",          // plain required
      age: null,                 // nullable admits null
      terms: false,              // boolean
      color: "red",              // static enum narrows to its option values
      address: { city: "Berlin" }, // nested object, its optional child omitted
      lines: [{ qty: 2 }],       // array of item outputs
      // nickname (required: false), fullName (computed) and secret (affect target) may be absent
    };
    expect(payload.firstName).toBe("Ada");

    // @ts-expect-error — "green" is not among the declared options
    const wrongEnum: Output = { ...payload, color: "green" };
    // @ts-expect-error — transient fields are stripped from the parsed values, so the payload type omits them
    const withTransient: Output = { ...payload, badge: "x" };
    // @ts-expect-error — firstName is required in the payload
    const missingRequired: Output = { age: 1, terms: true, color: "red", address: { city: "x" }, lines: [] };
    // @ts-expect-error — qty must be a number
    const wrongRowType: Output = { ...payload, lines: [{ qty: "2" }] };

    expect([wrongEnum, withTransient, missingRequired, wrongRowType]).toBeDefined();
  });

  it("types the onSubmit prop of the typed DynamicForm", () => {
    const { DynamicForm } = createTypedForm(definition);
    type FormProps = InstanceType<typeof DynamicForm>["$props"];

    // a handler typed against the definition must be assignable — this is the
    // case WithReplacedProps exists for; an intersected onSubmit would demand
    // the untyped SubmitHandler signature too and reject every typed handler
    const handler: FormProps["onSubmit"] = values => values.address.city;

    expect(DynamicForm).toBeDefined();
    expect(handler).toBeDefined();
  });
});
