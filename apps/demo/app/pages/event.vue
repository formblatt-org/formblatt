<script setup lang="ts">
import { ref } from "vue";
import type { ComputedResolver, FormDefinition, PathKey, ValidationResolver } from "@formblatt/core";
import {
  DynamicForm,
  DynamicField,
  DynamicFieldArray,
  readInput,
  type DynamicFormStore,
} from "@formblatt/vue";

/**
 * Every attendee row prices itself: a per-row `if` expression maps the ticket
 * type to its price, and per-row `ObjectCheck`s tie the ticket to the age —
 * the same item schema serves every row, so that's the only way rows differ.
 */
const eventDefinition: FormDefinition = {
  id: "event-registration-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "email", kind: "string", control: "email", label: "Order confirmation email", validations: [{ type: "email" }] },
    {
      name: "attendees", kind: "array", label: "Attendees",
      item: {
        name: "attendee", kind: "object",
        checks: [
          {
            when: { path: ["ticket"], op: "eq", value: "child" },
            assert: { path: ["age"], op: "lte", value: 12 },
            target: "age",
            error: "Child tickets are for ages 12 and under — enter the age",
          },
          {
            when: { path: ["ticket"], op: "eq", value: "student" },
            assert: { path: ["age"], op: "gte", value: 16 },
            target: "age",
            error: "Student tickets require age 16+ — enter the age",
          },
        ],
        fields: [
          { name: "fullName", kind: "string", control: "text" },
          {
            name: "ticket", kind: "enum", control: "select",
            options: [
              { label: "Adult — €49", value: "adult" },
              { label: "Student — €25", value: "student" },
              { label: "Child — €10", value: "child" },
            ],
          },
          { name: "age", kind: "number", control: "number", required: false },
          {
            name: "price", kind: "number", required: false,
            computed: {
              expression: {
                if: { path: ["ticket"], op: "eq", value: "adult" },
                then: { const: 49 },
                else: {
                  if: { path: ["ticket"], op: "eq", value: "student" },
                  then: { const: 25 },
                  else: {
                    if: { path: ["ticket"], op: "eq", value: "child" },
                    then: { const: 10 },
                    else: { const: 0 },
                  },
                },
              },
            },
          },
        ],
      },
      initial: [{ ticket: "adult" }],
    },
    {
      name: "promoCode", kind: "string", control: "text", label: "Promo code", required: false,
      validations: [{ type: "remote", value: "promoCode", message: "This code is not valid" }],
    },
    {
      name: "total", kind: "number", required: false,
      computed: { source: "total", dependsOn: [["attendees"], ["promoCode"]] },
    },
  ],
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Stands in for GET /promo/validate — EARLYBIRD is the only live code. */
const promoCache = new Map<string, boolean>();

const resolveValidation: ValidationResolver = async (source, value) => {
  if (source !== "promoCode") return true;

  const code = String(value).toUpperCase();
  const cached = promoCache.get(code);
  if (cached !== undefined) return cached;

  await delay(400);
  const valid = code === "EARLYBIRD";
  promoCache.set(code, valid);
  return valid;
};

/** Sums the rows' computed prices; a valid EARLYBIRD code takes 10% off. */
const resolveComputed: ComputedResolver = (source, { deps }) => {
  if (source !== "total") return 0;

  const attendees = (deps.attendees ?? []) as { price?: number }[];
  const sum = attendees.reduce((acc, attendee) => acc + (attendee.price ?? 0), 0);
  const discounted = String(deps.promoCode ?? "").toUpperCase() === "EARLYBIRD" ? sum * 0.9 : sum;
  return Math.round(discounted * 100) / 100;
};

const valueAt = (form: DynamicFormStore, path: PathKey[]) => readInput(form, path);

const money = (value: unknown) => `€${Number(value ?? 0).toFixed(2)}`;

const registered = ref<unknown>(null);

const register = async (values: unknown) => {
  await delay(700);
  registered.value = values;
}
</script>

<template>
  <div class="event-demo">
    <h1>DevConf 2026 — Registration</h1>
    <p class="tagline">
      Register several attendees at once: each row prices itself through a per-row
      expression, per-row checks tie child/student tickets to the age, and the promo
      code validates against the "server".
    </p>

    <div v-if="registered" class="confirmed">
      <h2>See you there!</h2>
      <pre>{{ JSON.stringify(registered, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="eventDefinition"
      :resolve-validation="resolveValidation"
      :resolve-computed="resolveComputed"
      error-display="touched"
      @submit="register"
      v-slot="{ form, isSubmitting, isBusy }"
    >
      <DynamicField name="email" />

      <DynamicFieldArray name="attendees" v-slot="{ items, itemPath, insert, remove }">
        <div class="attendees">
          <div class="attendee-grid header">
            <span>Attendee</span>
            <span>Ticket</span>
            <span>Age</span>
            <span class="num">Price</span>
            <span />
          </div>

          <div v-for="(id, index) in items" :key="id" class="attendee-grid">
            <DynamicField :path="itemPath(index, 'fullName')" />
            <DynamicField :path="itemPath(index, 'ticket')" />
            <DynamicField :path="itemPath(index, 'age')" />
            <span class="num price">{{ money(valueAt(form, itemPath(index, 'price'))) }}</span>
            <button
              type="button" class="remove" title="Remove attendee"
              :disabled="items.length === 1"
              @click="remove(index)"
            >✕</button>
          </div>

          <button type="button" class="btn" @click="insert({ ticket: 'adult' })">+ Add attendee</button>
        </div>
      </DynamicFieldArray>

      <div class="order-row">
        <DynamicField name="promoCode" />
        <div class="total">
          <span>Total</span>
          <strong>{{ money(valueAt(form, ['total'])) }}</strong>
        </div>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="isSubmitting || isBusy">
        {{ isSubmitting ? "Registering…" : "Register" }}
      </button>
    </DynamicForm>

    <aside v-if="!registered" class="try">
      <strong>Try:</strong> a Child ticket with age 30 (per-row check), and promo code
      <code>EARLYBIRD</code> for 10% off — any other code fails the remote check.
    </aside>
  </div>
</template>

<style scoped>
.event-demo {
  max-width: 620px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.event-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.confirmed {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.confirmed h2 {
  margin: 0 0 .5rem;
  font-size: 1.05rem;
}

.confirmed pre {
  margin: 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  max-height: 280px;
  overflow: auto;
}

.attendees {
  display: flex;
  flex-direction: column;
  gap: .625rem;
  margin: 1.25rem 0;
}

.attendee-grid {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 72px 76px 28px;
  gap: .625rem;
  align-items: start;
}

.attendee-grid.header {
  font-size: .75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #6b7280;
}

.num {
  text-align: right;
}

.price {
  padding-top: .55rem;
  font-size: .9rem;
  font-variant-numeric: tabular-nums;
}

.remove {
  width: 26px;
  height: 26px;
  margin-top: .35rem;
  padding: 0;
  font-size: .8rem;
  line-height: 1;
  color: #9ca3af;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
}

.remove:hover:not(:disabled) {
  color: #dc2626;
  border-color: #fca5a5;
}

.remove:disabled {
  opacity: .35;
  cursor: not-allowed;
}

.order-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.25rem;
  align-items: end;
  margin-bottom: 1.25rem;
}

.total {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-bottom: .3rem;
}

.total span {
  font-size: .75rem;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #6b7280;
}

.total strong {
  font-size: 1.25rem;
  font-variant-numeric: tabular-nums;
}

.btn {
  align-self: flex-start;
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.btn:hover:not(:disabled) {
  background: #f9fafb;
}

.btn-primary {
  color: #fff;
  background: #4f46e5;
  border-color: #4f46e5;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.try {
  margin-top: 1.5rem;
  padding: .875rem 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  font-size: .82rem;
  color: #78350f;
}

.try code {
  padding: .05rem .3rem;
  background: #fef3c7;
  border-radius: 4px;
  font-size: .9em;
}
</style>
