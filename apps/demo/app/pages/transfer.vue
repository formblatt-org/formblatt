<script setup lang="ts">
import { ref } from "vue";
import * as v from "valibot";
import type { FormDefinition, PopulateEntry, PopulateResolver, ValidationFactory } from "@formblatt/core";
import { DynamicForm, type SubmitContext } from "@formblatt/vue";

const AVAILABLE_BALANCE = 2547.31;

const transferDefinition: FormDefinition = {
  id: "bank-transfer-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "beneficiary", kind: "enum", control: "select", label: "Saved beneficiaries", required: false,
      options: [
        { label: "Anna Weber (rent)", value: "anna" },
        { label: "Novak d.o.o. (invoices)", value: "novak" },
      ],
    },
    { name: "recipientName", kind: "string", control: "text", label: "Recipient name" },
    {
      name: "iban", kind: "string", control: "text", label: "IBAN",
      // `iban` is a host-registered rule — a real mod-97 checksum, not a regex
      validations: [{ type: "iban" }],
    },
    {
      name: "bic", kind: "string", control: "text", label: "BIC", required: false,
      validations: [{ type: "regex", value: "^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$", message: "8 or 11 characters, e.g. COBADEFF" }],
    },
    {
      name: "amount", kind: "number", control: "number", label: "Amount (€)",
      validations: [{ type: "minValue", value: 0.01, message: "The amount must be positive" }],
    },
    {
      // SEPA caps unstructured remittance info at 140 characters
      name: "reference", kind: "string", control: "text", label: "Reference", required: false,
      validations: [{ type: "maxLength", value: 140, message: "SEPA allows at most 140 characters" }],
    },
  ],
  affects: [
    {
      effect: "populate", trigger: ["beneficiary"], source: "beneficiaryLookup",
      allow: ["recipientName", "iban", "bic", "reference"],
    },
  ],
};

/**
 * The real IBAN check: rearrange, letters → 10…35, and the whole number must
 * be ≡ 1 (mod 97). Computed digit-by-digit, so no BigInt is needed.
 */
function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = [...rearranged]
    .map(char => (char >= "A" && char <= "Z" ? String(char.charCodeAt(0) - 55) : char))
    .join("");

  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

const rules: Record<string, ValidationFactory> = {
  iban: rule => v.check(
    (value: string) => isValidIban(value),
    rule.message ?? "Not a valid IBAN — check for typos",
  ),
};

const BENEFICIARIES: Record<string, PopulateEntry[]> = {
  anna: [
    { name: "recipientName", value: "Anna Weber" },
    { name: "iban", value: "DE89 3704 0044 0532 0130 00" },
    { name: "bic", value: "COBADEFFXXX" },
    { name: "reference", value: "Rent + utilities" },
  ],
  novak: [
    { name: "recipientName", value: "Novak d.o.o." },
    { name: "iban", value: "RS35 2600 0560 1001 6113 79" },
    { name: "bic", value: "" },
    { name: "reference", value: "Invoice 2026-" },
  ],
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const resolvePopulate: PopulateResolver = async (source, value) => {
  if (source !== "beneficiaryLookup") return [];

  await delay(400);
  return BENEFICIARIES[value as string] ?? [];
};

const executed = ref<unknown>(null);

/** Stands in for POST /transfers — the balance check is knowledge only the server has. */
const execute = async (values: unknown, context: SubmitContext) => {
  await delay(700);

  const { amount } = values as { amount: number };
  if (amount > AVAILABLE_BALANCE) {
    context.setFieldErrors({
      amount: `Insufficient funds — available balance is €${AVAILABLE_BALANCE.toFixed(2)}`,
    });
    return;
  }
  executed.value = values;
}
</script>

<template>
  <div class="transfer-demo">
    <div class="balance">
      <span>Checking account</span>
      <strong>€{{ AVAILABLE_BALANCE.toFixed(2) }}</strong>
    </div>

    <h1>New transfer</h1>
    <p class="tagline">
      Picking a saved beneficiary populates the payment fields (clearing it restores what you
      had typed), the IBAN runs a real mod-97 checksum as a host-registered rule, and the
      "server" rejects transfers your balance can't cover.
    </p>

    <div v-if="executed" class="done">
      <h2>Transfer executed</h2>
      <pre>{{ JSON.stringify(executed, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="transferDefinition"
      :rules="rules"
      :resolve-populate="resolvePopulate"
      error-display="touched"
      submit-label="Send money"
      @submit="execute"
    />

    <aside class="try">
      <strong>Try:</strong>
      <ul>
        <li>flip the last IBAN digit — the checksum catches it, a regex wouldn't</li>
        <li>an amount over €{{ AVAILABLE_BALANCE.toFixed(2) }} — rejected by the "server" on submit</li>
        <li>type your own details first, pick a beneficiary, then clear it — your input comes back</li>
      </ul>
    </aside>
  </div>
</template>

<style scoped>
.transfer-demo {
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

.balance {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 1.25rem;
  padding: .75rem 1rem;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  font-size: .85rem;
  color: #4338ca;
}

.balance strong {
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

.transfer-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.done {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.done h2 {
  margin: 0 0 .5rem;
  font-size: 1.05rem;
}

.done pre {
  margin: 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
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

.try ul {
  margin: .4rem 0 0;
  padding-left: 1.1rem;
}

.try li {
  margin: .15rem 0;
}
</style>
