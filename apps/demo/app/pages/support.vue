<script setup lang="ts">
import { ref } from "vue";
import type { FormDefinition, Option, OptionsResolver } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

/**
 * The category switches whole SECTIONS on and off via `visibleWhen`. Sections
 * are presentation, so each one's fields also carry a matching `hideAndClear`
 * affect — that is what relaxes `required` while hidden and clears stale
 * answers when the category changes; the section alone never would.
 */
const ticketDefinition: FormDefinition = {
  id: "support-ticket-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "category", kind: "enum", control: "select", label: "What do you need help with?",
      options: [
        { label: "Something is broken", value: "bug" },
        { label: "A billing question", value: "billing" },
        { label: "A feature request", value: "feature" },
      ],
    },
    { name: "subject", kind: "string", control: "text", label: "Subject", validations: [{ type: "minLength", value: 5 }] },

    // -- bug section --
    {
      name: "area", kind: "enum", control: "select", label: "Affected area",
      optionsSource: { source: "areas", dependsOn: [["category"]] },
    },
    {
      name: "severity", kind: "enum", control: "radio", label: "Severity",
      options: [
        { label: "Blocking my work", value: "blocker" },
        { label: "Annoying, but I can work around it", value: "major" },
        { label: "Cosmetic", value: "minor" },
      ],
    },
    {
      name: "steps", kind: "string", control: "textarea", label: "Steps to reproduce",
      validations: [{ type: "minLength", value: 30, message: "Walk us through it — at least 30 characters" }],
    },

    // -- billing section --
    {
      name: "invoiceNumber", kind: "string", control: "text", label: "Invoice number",
      validations: [{ type: "regex", value: "^INV-[0-9]{5}$", message: "Looks like INV-12345 on your receipt" }],
    },
    { name: "billingEmail", kind: "string", control: "email", label: "Billing account email", validations: [{ type: "email" }] },

    // -- feature section --
    {
      name: "problem", kind: "string", control: "textarea", label: "What problem would this solve?",
      validations: [{ type: "minLength", value: 30, message: "Tell us about the underlying problem — at least 30 characters" }],
    },
    { name: "blocking", kind: "boolean", control: "checkbox", label: "This is blocking my adoption", required: false },

    { name: "email", kind: "string", control: "email", label: "Your email", validations: [{ type: "email" }] },
  ],
  affects: [
    { effect: "hideAndClear", when: { path: ["category"], op: "ne", value: "bug" }, targets: [["area"], ["severity"], ["steps"]] },
    { effect: "hideAndClear", when: { path: ["category"], op: "ne", value: "billing" }, targets: [["invoiceNumber"], ["billingEmail"]] },
    { effect: "hideAndClear", when: { path: ["category"], op: "ne", value: "feature" }, targets: [["problem"], ["blocking"]] },
  ],
  layout: [
    { type: "field", name: "category" },
    { type: "field", name: "subject" },
    {
      type: "section", id: "bugDetails", title: "Bug details",
      visibleWhen: { path: ["category"], op: "eq", value: "bug" },
      children: [
        { type: "field", name: "area" },
        { type: "field", name: "severity" },
        { type: "field", name: "steps" },
      ],
    },
    {
      type: "section", id: "billingDetails", title: "Billing details",
      visibleWhen: { path: ["category"], op: "eq", value: "billing" },
      children: [
        { type: "field", name: "invoiceNumber" },
        { type: "field", name: "billingEmail" },
      ],
    },
    {
      type: "section", id: "featureDetails", title: "Feature request",
      visibleWhen: { path: ["category"], op: "eq", value: "feature" },
      children: [
        { type: "field", name: "problem" },
        { type: "field", name: "blocking" },
      ],
    },
    { type: "field", name: "email" },
  ],
};

const AREAS_BY_CATEGORY: Record<string, Option[]> = {
  bug: [
    { label: "Form rendering", value: "rendering" },
    { label: "Validation", value: "validation" },
    { label: "Wizard navigation", value: "wizard" },
    { label: "Docs / examples", value: "docs" },
  ],
};

const resolveOptions: OptionsResolver = async (source, { deps }) => {
  if (source !== "areas") return [];
  await new Promise(resolve => setTimeout(resolve, 300));
  return AREAS_BY_CATEGORY[deps.category as string] ?? [];
};

const ticket = ref<unknown>(null);

const submitTicket = async (values: unknown) => {
  await new Promise(resolve => setTimeout(resolve, 600));
  ticket.value = values;
}
</script>

<template>
  <div class="support-demo">
    <h1>Contact support</h1>
    <p class="tagline">
      One ticket form, three shapes: the category swaps entire sections via
      <code>visibleWhen</code>, with matching <code>hideAndClear</code> affects so a switched
      category never submits the other categories' answers — check the payload.
    </p>

    <div v-if="ticket" class="filed">
      <h2>Ticket filed</h2>
      <p>Only the active category's fields made it into the payload:</p>
      <pre>{{ JSON.stringify(ticket, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="ticketDefinition"
      :resolve-options="resolveOptions"
      error-display="touched"
      submit-label="File ticket"
      @submit="submitTicket"
    />
  </div>
</template>

<style scoped>
.support-demo {
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

.support-demo h1 {
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

.filed {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.filed h2 {
  margin: 0 0 .25rem;
  font-size: 1.05rem;
}

.filed p {
  margin: 0 0 .5rem;
  font-size: .875rem;
}

.filed pre {
  margin: 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}
</style>
