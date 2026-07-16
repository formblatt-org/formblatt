<script setup lang="ts">
import { ref } from "vue";
import { isValueField } from "@formblatt/core";
import type { FormDefinition } from "@formblatt/core";
import { DynamicForm, DynamicField, DynamicLayout, readInput, type DynamicFormStore } from "@formblatt/vue";

/**
 * `page` nodes turn the layout into a wizard: one step at a time, Next gated
 * on the current page's validation. The experience page carries a
 * `visibleWhen`, so answering "No" removes it from the step order entirely —
 * and the matching `hideAndClear` affect makes its required fields optional
 * while skipped (page visibility alone never relaxes `required`) and clears
 * them, so a changed answer cannot submit stale data.
 */
const applicationDefinition: FormDefinition = {
  id: "job-application-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "firstName", kind: "string", control: "text", label: "First name" },
    { name: "lastName", kind: "string", control: "text", label: "Last name" },
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    {
      name: "phone", kind: "string", control: "text", label: "Phone", required: false,
      validations: [{ type: "regex", value: "^\\+?[0-9 ]{7,20}$", message: "Digits and spaces only, e.g. +49 30 1234567" }],
    },
    {
      name: "hasExperience", kind: "enum", control: "radio", label: "Do you have prior work experience?",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No, this would be my first role", value: "no" },
      ],
    },

    { name: "currentTitle", kind: "string", control: "text", label: "Current job title" },
    { name: "currentEmployer", kind: "string", control: "text", label: "Current employer" },
    {
      name: "yearsExperience", kind: "number", control: "number", label: "Years of experience",
      validations: [{ type: "minValue", value: 1 }, { type: "integer" }],
    },
    {
      name: "noticePeriod", kind: "enum", control: "select", label: "Notice period",
      options: [
        { label: "Available immediately", value: "none" },
        { label: "1 month", value: "1m" },
        { label: "3 months", value: "3m" },
      ],
    },

    {
      name: "coverLetter", kind: "string", control: "textarea", label: "Why do you want to join us?",
      validations: [{ type: "minLength", value: 40, message: "Tell us a bit more — at least 40 characters" }],
    },
    {
      name: "salaryExpectation", kind: "number", control: "number", label: "Salary expectation (€/year)", required: false,
      validations: [{ type: "minValue", value: 0 }],
    },
    {
      name: "startDate", kind: "date", control: "date", label: "Earliest start date",
      validations: [{ type: "minValue", value: "2026-08-01", message: "We can staff this role from 2026-08-01 on" }],
    },

    {
      name: "confirmTruthful", kind: "boolean", control: "checkbox", label: "I confirm my answers are truthful and complete",
      validations: [{ type: "isTrue", message: "Please confirm before submitting" }],
    },
  ],
  affects: [
    {
      effect: "hideAndClear",
      when: { path: ["hasExperience"], op: "ne", value: "yes" },
      targets: [["currentTitle"], ["currentEmployer"], ["yearsExperience"], ["noticePeriod"]],
    },
  ],
  layout: [
    {
      type: "page", id: "about", title: "About you",
      children: [
        { type: "field", name: "firstName" },
        { type: "field", name: "lastName" },
        { type: "field", name: "email" },
        { type: "field", name: "phone" },
        { type: "field", name: "hasExperience" },
      ],
    },
    {
      type: "page", id: "experience", title: "Work experience",
      visibleWhen: { path: ["hasExperience"], op: "eq", value: "yes" },
      children: [
        { type: "field", name: "currentTitle" },
        { type: "field", name: "currentEmployer" },
        { type: "field", name: "yearsExperience" },
        { type: "field", name: "noticePeriod" },
      ],
    },
    {
      type: "page", id: "motivation", title: "Motivation",
      children: [
        { type: "field", name: "coverLetter" },
        { type: "field", name: "salaryExpectation" },
        { type: "field", name: "startDate" },
      ],
    },
    {
      type: "page", id: "review", title: "Review & submit",
      children: [
        { type: "field", name: "confirmTruthful" },
      ],
    },
  ],
};

/** Everything the review step lists: label → current value, skipped/empty fields left out. */
const summaryOf = (form: DynamicFormStore) =>
  applicationDefinition.fields
    .filter(isValueField)
    .filter(field => field.name !== "confirmTruthful")
    .map(field => ({ label: field.label ?? field.name, value: readInput(form, [field.name]) }))
    .filter(entry => entry.value !== undefined && entry.value !== "");

const submitted = ref<unknown>(null);

/** Stands in for POST /applications — async, so the form stays isSubmitting meanwhile. */
const submitApplication = async (values: unknown) => {
  await new Promise(resolve => setTimeout(resolve, 800));
  submitted.value = values;
}
</script>

<template>
  <div class="careers-demo">
    <h1>Job application</h1>
    <p class="tagline">
      A multi-step wizard from `page` layout nodes: Next validates only the current step,
      and the experience step is skipped entirely for first-time applicants.
    </p>

    <div v-if="submitted" class="confirmation">
      <h2>Thanks for applying!</h2>
      <p>We received your application and will get back to you within a week.</p>
      <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="applicationDefinition"
      @submit="submitApplication"
      v-slot="{ form, isSubmitting, isBusy, pages }"
    >
      <!-- the confirm checkbox is hand-placed below the summary, so it is excluded here -->
      <DynamicLayout :exclude="['confirmTruthful']" />

      <template v-if="pages.isLast.value">
        <dl class="review">
          <div v-for="entry in summaryOf(form)" :key="entry.label" class="review-row">
            <dt>{{ entry.label }}</dt>
            <dd>{{ entry.value }}</dd>
          </div>
        </dl>

        <DynamicField name="confirmTruthful" />

        <div class="actions">
          <button type="submit" class="btn btn-primary" :disabled="isSubmitting || isBusy">
            {{ isSubmitting ? "Submitting…" : "Submit application" }}
          </button>
        </div>
      </template>
    </DynamicForm>
  </div>
</template>

<style scoped>
.careers-demo {
  max-width: 520px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.careers-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.confirmation {
  padding: 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  color: #065f46;
}

.confirmation h2 {
  margin: 0 0 .25rem;
  font-size: 1.05rem;
}

.confirmation p {
  margin: 0;
  font-size: .875rem;
}

.confirmation pre {
  margin: .75rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  max-height: 260px;
  overflow: auto;
}

.review {
  margin: 1.25rem 0;
  padding: 1rem 1.25rem;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
}

.review-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: .75rem;
  padding: .3rem 0;
  font-size: .85rem;
}

.review-row dt {
  color: #6b7280;
}

.review-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.actions {
  margin-top: 1rem;
}

.btn {
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.btn-primary {
  color: #fff;
  background: #4f46e5;
  border: 1px solid #4f46e5;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
