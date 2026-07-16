<script setup lang="ts">
import { ref } from "vue";
import type { FormDefinition } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

/**
 * The charge total is pure expression language — no host resolver: `if`
 * branches pick the preset or the custom amount, and the fee coverage
 * multiplies by 1.03. It recomputes live on every relevant keystroke.
 */
const donationDefinition: FormDefinition = {
  id: "donation-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "preset", kind: "enum", control: "radio", label: "Amount", initial: "25",
      options: [
        { label: "€10", value: "10" },
        { label: "€25", value: "25" },
        { label: "€50", value: "50" },
        { label: "Custom…", value: "custom" },
      ],
    },
    {
      // revealed only for "Custom…" — and only required while visible
      name: "customAmount", kind: "number", control: "number", label: "Your amount (€)",
      requiredMessage: "Enter an amount",
      validations: [{ type: "minValue", value: 1, message: "The minimum donation is €1" }],
    },
    {
      name: "frequency", kind: "enum", control: "radio", label: "Frequency", initial: "once",
      options: [
        { label: "One time", value: "once" },
        { label: "Monthly", value: "monthly" },
      ],
    },
    {
      name: "coverFees", kind: "boolean", control: "checkbox", required: false,
      label: "Add 3% to cover payment processing fees",
    },
    { name: "email", kind: "string", control: "email", label: "Email for the receipt", validations: [{ type: "email" }] },
    {
      name: "chargeTotal", kind: "number", label: "You donate (€)", required: false, disabled: true,
      computed: {
        expression: {
          op: "round", precision: 2,
          args: [{
            op: "mul",
            args: [
              // enum values are strings — `mul` coerces "25" to a number
              {
                if: { path: ["preset"], op: "eq", value: "custom" },
                then: { ref: ["customAmount"] },
                else: { ref: ["preset"] },
              },
              {
                if: { path: ["coverFees"], op: "truthy" },
                then: { const: 1.03 },
                else: { const: 1 },
              },
            ],
          }],
        },
      },
    },
  ],
  affects: [
    { effect: "show", when: { path: ["preset"], op: "eq", value: "custom" }, targets: [["customAmount"]] },
  ],
};

const donated = ref<unknown>(null);

const donate = async (values: unknown) => {
  await new Promise(resolve => setTimeout(resolve, 600));
  donated.value = values;
}
</script>

<template>
  <div class="donate-demo">
    <h1>Support the sanctuary</h1>
    <p class="tagline">
      Choosing "Custom…" reveals an amount input (required only while visible), and the
      live total is a pure <code>if</code>/<code>mul</code>/<code>round</code> expression —
      no host code computes it.
    </p>

    <div v-if="donated" class="thanks">
      <h2>Thank you! ❤</h2>
      <p>Your receipt is on its way.</p>
      <pre>{{ JSON.stringify(donated, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="donationDefinition"
      error-display="touched"
      submit-label="Donate"
      @submit="donate"
    />
  </div>
</template>

<style scoped>
.donate-demo {
  max-width: 460px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.donate-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.tagline code {
  padding: .05rem .3rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: .8em;
}

.thanks {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.thanks h2 {
  margin: 0 0 .25rem;
  font-size: 1.05rem;
}

.thanks p {
  margin: 0 0 .5rem;
  font-size: .875rem;
}

.thanks pre {
  margin: 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}
</style>
