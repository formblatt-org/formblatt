<script setup lang="ts">
import { ref } from "vue";
import type { ComputedResolver, FormDefinition, Option, OptionsResolver, PathKey, PopulateResolver } from "@formblatt/core";
import {
  DynamicForm,
  DynamicField,
  DynamicFieldArray,
  readInput,
  type DynamicFormStore,
} from "@formblatt/vue";
import { initials, money } from "../utils/format";
import { shippingFor, subtotalOf, taxFor, type CartLine } from "../utils/pricing";

const checkoutDefinition: FormDefinition = {
  id: "checkout-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },

    { name: "firstName", kind: "string", control: "text", label: "First name" },
    { name: "lastName", kind: "string", control: "text", label: "Last name" },
    { name: "address", kind: "string", control: "text", label: "Address" },
    { name: "city", kind: "string", control: "text", label: "City" },
    { name: "postalCode", kind: "string", control: "text", label: "Postal code" },
    { name: "country", kind: "enum", control: "select", label: "Country", optionsSource: { source: "countries" } },
    { name: "state", kind: "enum", control: "select", label: "State / Province", required: false,
      optionsSource: { source: "states", dependsOn: [["country"]] } },

    { name: "sameAsShipping", kind: "boolean", control: "checkbox", label: "Billing address same as shipping", initial: true },
    { name: "billingAddress", kind: "string", control: "text", label: "Address" },
    { name: "billingCity", kind: "string", control: "text", label: "City" },
    { name: "billingPostalCode", kind: "string", control: "text", label: "Postal code" },
    { name: "billingCountry", kind: "enum", control: "select", label: "Country", optionsSource: { source: "countries" } },

    { name: "cardNumber", kind: "string", control: "text", label: "Card number", validations: [{ type: "minLength", value: 12 }] },
    { name: "cardName", kind: "string", control: "text", label: "Name on card" },
    { name: "cardExpiry", kind: "string", control: "text", label: "Expiration (MM / YY)" },
    { name: "cardCvc", kind: "string", control: "text", label: "Security code" },

    {
      name: "lines", kind: "array", label: "Order lines",
      item: {
        name: "line", kind: "object",
        checks: [
          {
            when: { path: ["sku"], op: "eq", value: "TS-001" },
            assert: { path: ["qty"], op: "gte", value: 10 },
            target: "qty",
            error: "Min. qty 10"
          },
          {
            when: { path: ["sku"], op: "eq", value: "CP-114" },
            assert: { path: ["qty"], op: "lte", value: 20 },
            target: "qty",
            error: "Max. qty 20"
          }
        ],
        fields: [
          { name: "sku", kind: "string" },
          { name: "name", kind: "string" },
          { name: "price", kind: "number" },
          { name: "qty", kind: "number", control: "number",
            validations: [{ type: "minValue", value: 1, message: "Min. 1" }] },
          { name: "lineTotal", kind: "number", required: false,
            computed: { expression: { op: "round", precision: 2, args: [{ op: "mul", args: [{ ref: ["qty"] }, { ref: ["price"] }] }] } } },
        ]
      },
      initial: [
        { sku: "TS-001", name: "Merino Wool T-Shirt", price: 48, qty: 12 },
        { sku: "CP-114", name: "Canvas Field Cap", price: 29.5, qty: 2 },
      ]
    },

    // computed — displayed as text in the summary, never edited
    { name: "subtotal", kind: "number", required: false, computed: { source: "subtotal", dependsOn: [["lines"]] } },
    { name: "shippingCost", kind: "number", required: false, computed: { source: "shipping", dependsOn: [["subtotal"], ["country"]] } },
    { name: "tax", kind: "number", required: false, computed: { source: "tax", dependsOn: [["subtotal"]] } },
    {
      name: "total", kind: "number", required: false,
      computed: {
        expression: {
          op: "round", precision: 2,
          args: [{
            op: "add",
            args: [
              { op: "coalesce", args: [{ ref: ["subtotal"] }, { const: 0 }] },
              { op: "coalesce", args: [{ ref: ["shippingCost"] }, { const: 0 }] },
              { op: "coalesce", args: [{ ref: ["tax"] }, { const: 0 }] },
            ]
          }]
        }
      }
    },
  ],
  affects: [
    {
      effect: "hideAndClear",
      when: { path: ["sameAsShipping"], op: "truthy" },
      targets: [["billingAddress"], ["billingCity"], ["billingPostalCode"], ["billingCountry"]]
    },
  ],
}

// no populate rules on this form, but DynamicForm always wants a resolver
const resolvePopulate: PopulateResolver = () => [];

const resolveOptions: OptionsResolver = (source, { deps }) => {
  if (source === "countries") {
    return [
      { label: "United States", value: "us" },
      { label: "Canada", value: "ca" },
      { label: "Germany", value: "de" },
    ];
  }

  if (source === "states") {
    const states: Record<string, Option[]> = {
      us: [{ label: "California", value: "ca" }, { label: "New York", value: "ny" }],
      ca: [{ label: "Ontario", value: "on" }, { label: "Quebec", value: "qc" }],
      de: [{ label: "Bavaria", value: "by" }, { label: "Berlin", value: "be" }],
    };
    return states[deps.country as string] ?? [];
  }

  return [];
}

/** Stands in for the pricing service a real checkout would call. */
const resolveComputed: ComputedResolver = (source, { deps }) => {
  const subtotal = Number(deps.subtotal) || 0;

  switch (source) {
    case "subtotal": return subtotalOf((deps.lines ?? []) as CartLine[]);
    case "shipping": return shippingFor(subtotal);
    case "tax": return taxFor(subtotal);
    default: return 0;
  }
}

/** Reads a live value for the read-only summary — those figures are not inputs. */
const valueAt = (form: DynamicFormStore, path: PathKey[]) => readInput(form, path);

const placed = ref(false);

const placeOrder = (values: unknown) => {
  console.log("[checkout] order placed", values);
  placed.value = true;
}
</script>

<template>
  <div class="checkout-page">
    <header class="store">
      <span class="logo">NORTHBOUND</span>
    </header>

    <p v-if="placed" class="placed">Order placed — check the console for the submitted payload.</p>

    <DynamicForm
      :definition="checkoutDefinition"
      :resolve-populate="resolvePopulate"
      :resolve-options="resolveOptions"
      :resolve-computed="resolveComputed"
      @submit="placeOrder"
      v-slot="{ form, isSubmitting, isPopulating, isComputing }"
    >
      <div class="grid">
        <!-- ---------- left: the form ---------- -->
        <div class="main">
          <section class="block">
            <h2>Contact</h2>
            <DynamicField name="email" />
          </section>

          <section class="block">
            <h2>Delivery</h2>
            <div class="row two">
              <DynamicField name="firstName" />
              <DynamicField name="lastName" />
            </div>
            <DynamicField name="address" />
            <div class="row three">
              <DynamicField name="city" />
              <DynamicField name="postalCode" />
              <DynamicField name="country" />
            </div>
            <DynamicField name="state" />
          </section>

          <section class="block">
            <h2>Billing address</h2>
            <div class="check">
              <DynamicField name="sameAsShipping" />
            </div>
            <DynamicField name="billingAddress" />
            <div class="row three">
              <DynamicField name="billingCity" />
              <DynamicField name="billingPostalCode" />
              <DynamicField name="billingCountry" />
            </div>
          </section>

          <section class="block">
            <h2>Payment</h2>
            <DynamicField name="cardNumber" />
            <DynamicField name="cardName" />
            <div class="row two">
              <DynamicField name="cardExpiry" />
              <DynamicField name="cardCvc" />
            </div>
          </section>

          <button class="pay" type="submit" :disabled="isSubmitting || isPopulating">
            {{ isSubmitting ? 'Processing…' : `Pay ${money(valueAt(form, ['total']))}` }}
          </button>
        </div>

        <!-- ---------- right: order summary ---------- -->
        <aside class="summary">
          <DynamicFieldArray name="lines" v-slot="{ items, itemPath }">
            <ul class="lines">
              <li v-for="(id, index) in items" :key="id" class="line">
                <div class="thumb">{{ initials(valueAt(form, itemPath(index, 'name'))) }}</div>
                <div class="meta">
                  <span class="name">{{ valueAt(form, itemPath(index, 'name')) }}</span>
                  <span class="sku">{{ valueAt(form, itemPath(index, 'sku')) }}</span>
                </div>
                <div class="qty">
                  <DynamicField :path="itemPath(index, 'qty')" />
                </div>
                <div class="amount">{{ money(valueAt(form, itemPath(index, 'lineTotal'))) }}</div>
              </li>
            </ul>
          </DynamicFieldArray>

          <dl class="totals">
            <div>
              <dt>Subtotal</dt>
              <dd :class="{ busy: isComputing(['subtotal']) }">{{ money(valueAt(form, ['subtotal'])) }}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd :class="{ busy: isComputing(['shippingCost']) }">{{ money(valueAt(form, ['shippingCost'])) }}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd :class="{ busy: isComputing(['tax']) }">{{ money(valueAt(form, ['tax'])) }}</dd>
            </div>
            <div class="grand">
              <dt>Total</dt>
              <dd>{{ money(valueAt(form, ['total'])) }}</dd>
            </div>
          </dl>

          <p class="hint">Free shipping on orders over $100.</p>
        </aside>
      </div>
    </DynamicForm>
  </div>
</template>

<style scoped>
.checkout-page {
  min-height: 100vh;
  background: #fff;
}

.store {
  max-width: 1040px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 1.25rem;
}

.logo {
  font-weight: 700;
  letter-spacing: .14em;
  font-size: .95rem;
}

.placed {
  max-width: 1040px;
  margin: 0 auto 1rem;
  padding: .75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .875rem;
}

.grid {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  gap: 3.5rem;
  align-items: start;
}

/* ---------- left ---------- */
.main {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.block {
  display: flex;
  flex-direction: column;
  gap: .875rem;
}

.block h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.row {
  display: grid;
  gap: .75rem;
}

.row.two { grid-template-columns: 1fr 1fr; }
.row.three { grid-template-columns: 1fr 1fr 1fr; }

.check :deep(.field label) {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: flex-end;
  gap: .5rem;
}

.check :deep(.field > label > span) {
  margin: 0;
  font-weight: 450;
}

.pay {
  margin-top: .5rem;
  padding: .95rem 1rem;
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  color: #fff;
  background: #1f2937;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.pay:hover:not(:disabled) { background: #111827; }
.pay:disabled { opacity: .55; cursor: not-allowed; }

/* ---------- right ---------- */
.summary {
  position: sticky;
  top: 1.5rem;
  padding: 1.5rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.lines {
  margin: 0 0 1.25rem;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.line {
  display: grid;
  grid-template-columns: 44px 1fr 68px auto;
  align-items: center;
  gap: .75rem;
}

.thumb {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: #e5e7eb;
  border-radius: 8px;
  font-weight: 600;
  color: #6b7280;
}

.meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.meta .name {
  font-size: .9rem;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta .sku {
  font-size: .75rem;
  color: #9ca3af;
}

.qty :deep(input) {
  padding: .35rem .4rem;
  text-align: center;
}

.amount {
  font-size: .9rem;
  font-variant-numeric: tabular-nums;
}

.totals {
  margin: 0;
  padding-top: 1.25rem;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: .6rem;
}

.totals > div {
  display: flex;
  justify-content: space-between;
  font-size: .9rem;
}

.totals dt { color: #6b7280; }
.totals dd { margin: 0; font-variant-numeric: tabular-nums; transition: opacity .15s; }

/* a computed value is being recalculated by resolveComputed */
.totals dd.busy { opacity: .35; }

.totals .grand {
  padding-top: .75rem;
  margin-top: .25rem;
  border-top: 1px solid #e5e7eb;
  font-size: 1.05rem;
  font-weight: 650;
}

.totals .grand dt { color: #1f2937; }

.hint {
  margin: 1rem 0 0;
  font-size: .78rem;
  color: #9ca3af;
}

@media (max-width: 860px) {
  .grid { grid-template-columns: 1fr; gap: 2rem; }
  .summary { position: static; order: -1; }
  .row.three { grid-template-columns: 1fr; }
}
</style>
