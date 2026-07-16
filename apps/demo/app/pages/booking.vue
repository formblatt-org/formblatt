<script setup lang="ts">
import { ref } from "vue";
import type { ComputedResolver, FormDefinition, Option, OptionsResolver } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

/**
 * The time slot cascades from THREE dependencies at once — service, staff and
 * date. Changing any of them reloads the slots, and the current pick survives
 * only if the fresh list still offers it.
 */
const bookingDefinition: FormDefinition = {
  id: "appointment-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "service", kind: "enum", control: "select", label: "Service",
      options: [
        { label: "Haircut (30 min)", value: "haircut" },
        { label: "Color & cut (90 min)", value: "color" },
        { label: "Beard trim (15 min)", value: "beard" },
      ],
    },
    {
      name: "staff", kind: "enum", control: "select", label: "Stylist",
      optionsSource: { source: "staff", dependsOn: [["service"]] },
    },
    {
      name: "date", kind: "date", control: "date", label: "Date",
      validations: [{ type: "minValue", value: "2026-07-16", message: "Pick a date from today on" }],
    },
    {
      name: "timeSlot", kind: "enum", control: "select", label: "Time",
      optionsSource: { source: "slots", dependsOn: [["service"], ["staff"], ["date"]] },
    },
    {
      name: "price", kind: "number", label: "Price (€)", required: false, disabled: true,
      computed: { source: "price", dependsOn: [["service"]] },
    },
    { name: "notes", kind: "string", control: "textarea", label: "Anything we should know?", required: false },
  ],
};

const STAFF_BY_SERVICE: Record<string, Option[]> = {
  haircut: [
    { label: "Mara", value: "mara" },
    { label: "Jonas", value: "jonas" },
    { label: "Iva", value: "iva" },
  ],
  color: [
    { label: "Mara", value: "mara" },
    { label: "Iva", value: "iva" },
  ],
  beard: [
    { label: "Jonas", value: "jonas" },
  ],
};

const PRICES: Record<string, number> = { haircut: 35, color: 90, beard: 15 };

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Stands in for GET /availability?service=…&staff=…&date=… — deterministic
 * fake data: the slots depend visibly on who and which day, so reloads are
 * observable. Until all three deps are picked it returns nothing.
 */
const resolveOptions: OptionsResolver = async (source, { deps }) => {
  if (source === "staff") {
    await delay(300);
    return STAFF_BY_SERVICE[deps.service as string] ?? [];
  }
  if (source !== "slots") return [];

  const { service, staff, date } = deps as Record<string, string | undefined>;
  if (!service || !staff || !date) return [];

  await delay(500);
  const dayOffset = new Date(date).getDate() % 3;
  const morning = staff === "mara"; // Mara works mornings, the others afternoons
  const base = morning ? 9 : 13;
  return Array.from({ length: 4 }, (_, index) => {
    const hour = base + index + dayOffset;
    const time = `${String(hour).padStart(2, "0")}:00`;
    return { label: time, value: time };
  });
};

const resolveComputed: ComputedResolver = (source, { deps }) =>
  source === "price" ? PRICES[deps.service as string] : undefined;

const booked = ref<unknown>(null);

const book = async (values: unknown) => {
  await delay(600);
  booked.value = values;
}
</script>

<template>
  <div class="booking-demo">
    <h1>Book an appointment</h1>
    <p class="tagline">
      The time-slot select reloads whenever service, stylist <em>or</em> date changes —
      one <code>optionsSource</code> with three <code>dependsOn</code> paths. A picked slot
      is kept only if the fresh list still offers it.
    </p>

    <div v-if="booked" class="confirmed">
      <h2>You're booked!</h2>
      <pre>{{ JSON.stringify(booked, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="bookingDefinition"
      :resolve-options="resolveOptions"
      :resolve-computed="resolveComputed"
      error-display="touched"
      submit-label="Book appointment"
      @submit="book"
    />

    <aside class="try">
      <strong>Try:</strong> pick a service, stylist and date, then change the date —
      the slots reload and shift. Mara works mornings; Jonas and Iva take afternoons.
    </aside>
  </div>
</template>

<style scoped>
.booking-demo {
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

.booking-demo h1 {
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
</style>
