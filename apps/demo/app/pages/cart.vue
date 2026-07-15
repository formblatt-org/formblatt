<script setup lang="ts">
import { ref } from "vue";
import type { ComputedResolver, OptionsResolver, PathKey, PopulateResolver } from "@formblatt/core";
import {
  createTypedForm,
  defineFormDefinition,
  DynamicForm,
  readInput,
  type DynamicFormStore,
} from "@formblatt/vue";
import { initials, money } from "../utils/format";
import { subtotalOf, type CartLine } from "../utils/pricing";

const cartDefinition = defineFormDefinition({
  id: "cart-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "lines", kind: "array", label: "Cart lines",
      item: {
        name: "line", kind: "object",
        fields: [
          { name: "sku", kind: "string" },
          { name: "name", kind: "string" },
          { name: "price", kind: "number" },
          { name: "qty", kind: "number", control: "number",
            validations: [{ type: "minValue", value: 1, message: "Min. 1" }] },
          { name: "lineTotal", kind: "number", required: false,
            computed: { expression: { op: "round", precision: 2, args: [{ op: "mul", args: [{ ref: ["qty"] }, { ref: ["price"] }] }] } } },
        ],
      },
      initial: [
        { sku: "TS-001", name: "Merino Wool T-Shirt", price: 48, qty: 1 },
        { sku: "CP-114", name: "Canvas Field Cap", price: 29.5, qty: 2 },
        { sku: "SK-220", name: "Trail Socks (3-pack)", price: 18, qty: 1 },
      ],
    },
    { name: "subtotal", kind: "number", required: false, computed: { source: "subtotal", dependsOn: [["lines"]] } },
  ],
})

// Typed against cartDefinition: `name` props autocomplete and typos fail typecheck.
// These locals shadow the auto-imported components in the template.
const { DynamicField, DynamicFieldArray } = createTypedForm(cartDefinition);

// this form has neither populate rules nor dynamic options — no-op resolvers
const resolvePopulate: PopulateResolver = () => [];
const resolveOptions: OptionsResolver = () => [];

const resolveComputed: ComputedResolver = (source, { deps }) =>
  source === "subtotal" ? subtotalOf((deps.lines ?? []) as CartLine[]) : 0;

/** Reads a live value for read-only display — the summary is not an input. */
const valueAt = (form: DynamicFormStore, path: PathKey[]) => readInput(form, path);

/** Rows the user removed. Host-side state: it deliberately lives OUTSIDE the form. */
const removedLines = ref<Record<string, unknown>[]>([]);

function removeLine(
  form: DynamicFormStore,
  itemPath: (index: number, child?: string) => PathKey[],
  removeAt: (index: number) => void,
  index: number,
) {
  // capture the row BEFORE removing it — afterwards the data is gone
  const line = valueAt(form, itemPath(index)) as Record<string, unknown>;
  removedLines.value.push(line);
  removeAt(index);
}

function restoreLine(insert: (initialInput?: unknown) => void, index: number) {
  const [line] = removedLines.value.splice(index, 1);
  if (!line) return;

  const { lineTotal, ...restored } = line; // lineTotal recomputes from qty × price on insert
  insert(restored);
}

const submitted = ref<unknown>(null);

const placeOrder = (values: unknown) => {
  submitted.value = values;
}
</script>

<template>
  <div class="cart-page">
    <header class="store">
      <span class="logo">NORTHBOUND</span>
      <span class="crumb">/ Cart</span>
    </header>

    <div v-if="submitted" class="placed">
      Order submitted — payload below.
      <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
    </div>

    <DynamicForm
      :definition="cartDefinition"
      :resolve-populate="resolvePopulate"
      :resolve-options="resolveOptions"
      :resolve-computed="resolveComputed"
      @submit="placeOrder"
      v-slot="{ form, isSubmitting }"
    >
      <div class="grid">
        <section class="cart">
          <h2>Your cart</h2>

          <DynamicFieldArray name="lines" v-slot="{ items, itemPath, insert, remove }">
            <p v-if="!items.length" class="empty">Your cart is empty.</p>

            <ul class="lines">
              <li v-for="(id, index) in items" :key="id" class="line">
                <div class="thumb">{{ initials(valueAt(form, itemPath(index, 'name'))) }}</div>
                <div class="meta">
                  <span class="name">{{ valueAt(form, itemPath(index, 'name')) }}</span>
                  <span class="sku">
                    {{ valueAt(form, itemPath(index, 'sku')) }} ·
                    {{ money(valueAt(form, itemPath(index, 'price'))) }} each
                  </span>
                </div>
                <div class="qty">
                  <DynamicField :path="itemPath(index, 'qty')" />
                </div>
                <div class="amount">{{ money(valueAt(form, itemPath(index, 'lineTotal'))) }}</div>
                <button type="button" class="remove" title="Remove line"
                        @click="removeLine(form, itemPath, remove, index)">✕</button>
              </li>
            </ul>

            <!-- host-side state: what was removed, living outside the form -->
            <div v-if="removedLines.length" class="removed">
              <h3>Removed from cart</h3>
              <ul>
                <li v-for="(line, index) in removedLines" :key="index">
                  <span>{{ line.name }} <em>(qty {{ line.qty }})</em></span>
                  <button type="button" class="undo" @click="restoreLine(insert, index)">Undo</button>
                </li>
              </ul>
            </div>
          </DynamicFieldArray>
        </section>

        <aside class="summary">
          <dl class="totals">
            <div class="grand">
              <dt>Subtotal</dt>
              <dd>{{ money(valueAt(form, ['subtotal'])) }}</dd>
            </div>
          </dl>
          <button type="submit" class="checkout"
                  :disabled="isSubmitting || !form.isValid || !valueAt(form, ['subtotal'])">
            {{ isSubmitting ? 'Submitting…' : 'Checkout' }}
          </button>
          <p class="hint">Shipping and taxes calculated at checkout.</p>
        </aside>
      </div>
    </DynamicForm>
  </div>
</template>

<style scoped>
.cart-page {
  min-height: 100vh;
  background: #fff;
}

.store {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.75rem 1.5rem 1.25rem;
}

.logo {
  font-weight: 700;
  letter-spacing: .14em;
  font-size: .95rem;
}

.crumb {
  margin-left: .5rem;
  color: #9ca3af;
  font-size: .9rem;
}

.placed {
  max-width: 900px;
  margin: 0 auto 1rem;
  padding: .75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .875rem;
}

.placed pre {
  margin: .5rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  max-height: 220px;
  overflow: auto;
}

.grid {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 2.5rem;
  align-items: start;
}

.cart h2 {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.empty {
  color: #9ca3af;
  font-size: .9rem;
}

.lines {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.line {
  display: grid;
  grid-template-columns: 48px 1fr 76px 84px 28px;
  align-items: center;
  gap: .875rem;
  padding: .875rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.thumb {
  width: 48px;
  height: 48px;
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
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.remove {
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: .8rem;
  line-height: 1;
  color: #9ca3af;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: color .15s, border-color .15s;
}

.remove:hover {
  color: #dc2626;
  border-color: #fca5a5;
}

.removed {
  margin-top: 1.5rem;
  padding: .875rem 1rem;
  background: #fafafa;
  border: 1px dashed #e5e7eb;
  border-radius: 10px;
}

.removed h3 {
  margin: 0 0 .5rem;
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #6b7280;
}

.removed ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: .4rem;
}

.removed li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: .85rem;
  color: #6b7280;
}

.removed em {
  font-style: normal;
  color: #9ca3af;
}

.undo {
  padding: .2rem .6rem;
  font: inherit;
  font-size: .78rem;
  color: #4f46e5;
  background: transparent;
  border: 1px solid #c7d2fe;
  border-radius: 6px;
  cursor: pointer;
}

.undo:hover {
  background: #eef2ff;
}

.summary {
  position: sticky;
  top: 1.5rem;
  padding: 1.25rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.totals {
  margin: 0 0 1rem;
}

.totals .grand {
  display: flex;
  justify-content: space-between;
  font-size: 1rem;
  font-weight: 650;
}

.totals dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.checkout {
  width: 100%;
  padding: .8rem 1rem;
  font: inherit;
  font-size: .95rem;
  font-weight: 600;
  color: #fff;
  background: #1f2937;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.checkout:hover:not(:disabled) { background: #111827; }
.checkout:disabled { opacity: .55; cursor: not-allowed; }

.hint {
  margin: .75rem 0 0;
  font-size: .75rem;
  color: #9ca3af;
  text-align: center;
}

@media (max-width: 760px) {
  .grid { grid-template-columns: 1fr; gap: 1.5rem; }
  .summary { position: static; }
}
</style>
