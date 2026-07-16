<script setup lang="ts">
import { ref } from "vue";
import type { FormDefinition, Option } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

const AIRPORTS: Option[] = [
  { label: "Berlin (BER)", value: "BER" },
  { label: "Belgrade (BEG)", value: "BEG" },
  { label: "Zurich (ZRH)", value: "ZRH" },
  { label: "New York (JFK)", value: "JFK" },
];

/**
 * Conditions only compare a field against a STATIC value — "return after
 * departure" is path-vs-path, which the contract can't say directly. The
 * pattern: a computed `nights = dateDiff(departure, return)` field carrying a
 * `minValue: 0` validation. Content validations run on computed fields, so a
 * backwards trip errors right on the visible nights field.
 */
const searchDefinition: FormDefinition = {
  id: "flight-search-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "tripType", kind: "enum", control: "radio", label: "Trip", initial: "return",
      options: [
        { label: "Return", value: "return" },
        { label: "One way", value: "oneway" },
      ],
    },
    { name: "from", kind: "enum", control: "select", label: "From", options: AIRPORTS },
    { name: "to", kind: "enum", control: "select", label: "To", options: AIRPORTS },
    {
      name: "departDate", kind: "date", control: "date", label: "Departure",
      validations: [{ type: "minValue", value: "2026-07-16", message: "Departure can't be in the past" }],
    },
    { name: "returnDate", kind: "date", control: "date", label: "Return" },
    {
      name: "nights", kind: "number", label: "Nights", required: false, disabled: true,
      computed: { expression: { op: "dateDiff", unit: "days", args: [{ ref: ["departDate"] }, { ref: ["returnDate"] }] } },
      validations: [{ type: "minValue", value: 0, message: "The return flight can't leave before the outbound one" }],
    },
    {
      name: "passengers", kind: "number", control: "number", label: "Passengers", initial: 1,
      validations: [
        { type: "integer" },
        { type: "minValue", value: 1, message: "At least one passenger" },
        { type: "maxValue", value: 9, message: "Group bookings (10+) go through our service desk" },
      ],
    },
    {
      name: "cabin", kind: "enum", control: "select", label: "Cabin", initial: "economy",
      options: [
        { label: "Economy", value: "economy" },
        { label: "Premium Economy", value: "premium" },
        { label: "Business", value: "business" },
      ],
    },
  ],
  affects: [
    // one-way removes the return date AND the nights guard derived from it
    {
      effect: "hideAndClear",
      when: { path: ["tripType"], op: "eq", value: "oneway" },
      targets: [["returnDate"], ["nights"]],
    },
  ],
};

const search = ref<unknown>(null);

const runSearch = async (values: unknown) => {
  await new Promise(resolve => setTimeout(resolve, 800));
  search.value = values;
}
</script>

<template>
  <div class="flights-demo">
    <h1>Find a flight</h1>
    <p class="tagline">
      "One way" hides <em>and clears</em> the return date, and "return before departure"
      is caught by a computed <code>nights</code> field with a <code>minValue: 0</code>
      validation — the declarative way to express a cross-field date rule.
    </p>

    <div v-if="search" class="results">
      <h2>Searching flights…</h2>
      <p>This is where the results page would take over. The search request:</p>
      <pre>{{ JSON.stringify(search, null, 2) }}</pre>
      <button type="button" class="btn" @click="search = null">New search</button>
    </div>

    <DynamicForm
      v-else
      :definition="searchDefinition"
      error-display="touched"
      submit-label="Search flights"
      @submit="runSearch"
    />

    <aside v-if="!search" class="try">
      <strong>Try:</strong> a return date before the departure, then hit Search — the error
      lands on "Nights". Then switch to "One way": both fields disappear and their values
      are cleared.
    </aside>
  </div>
</template>

<style scoped>
.flights-demo {
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

.flights-demo h1 {
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

.results {
  padding: 1rem;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 10px;
  color: #3730a3;
}

.results h2 {
  margin: 0 0 .25rem;
  font-size: 1.05rem;
}

.results p {
  margin: 0 0 .5rem;
  font-size: .875rem;
}

.results pre {
  margin: 0 0 .75rem;
  padding: .6rem;
  background: #e0e7ff;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}

.btn {
  padding: .45rem .9rem;
  font: inherit;
  font-size: .85rem;
  font-weight: 550;
  color: #4338ca;
  background: #fff;
  border: 1px solid #c7d2fe;
  border-radius: 8px;
  cursor: pointer;
}

.btn:hover {
  background: #f5f6ff;
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
