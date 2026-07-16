<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { submit } from "@formisch/vue";
import type { ComputedResolver, FormDefinition, Option, OptionsResolver, PopulateEntry, PopulateResolver } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

/** Pure JSON-definition mode: the form renders itself, with no hand-placed markup. */
const accountDefinition: FormDefinition = {
  id: "login-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "profile", kind: "enum", control: "select", label: "Load demo profile", required: false, options: [
        { label: "Alice", value: "alice" },
        { label: "Bob", value: "bob" }
      ]
    },
    {
      name: "firstName", kind: "string", control: "text", label: "First Name", required: true
    },
    {
      name: "lastName", kind: "string", control: "text", label: "Last Name", required: true
    },
    {
      name: "fullName", kind: "string", control: "text", label: "Full Name", required: false, disabled: true,
      computed: { expression: { op: "concat", sep: " ", args: [{ ref: ["firstName"] }, { ref: ["lastName"] }] }}
    },
    {
      name: "email", kind: "string", control: "email", label: "Email", initial: "user@example.com", validations: [{ "type": "email" }],
    },
    {
      name: "password",
      kind: "string",
      control: "password",
      label: "Password",
      validations: [{ "type": "minLength", "value": 8 }],
    },
    {
      name: "confirmPassword", kind: "string", control: "password", label: "Confirm Password", hidden: true, validations: [{ "type": "minLength", "value": 8 }]
    },
    {
      name: "country", kind: "enum", control: "select", label: "Country", required: false, optionsSource: { source: "countries" }
    },
    { name: "state", kind: "enum", control: "select", label: "State", required: false, optionsSource: { source: "states", dependsOn: [["country"]] } },
    { name: "position", kind: "string", control: "text", label: "Position", required: false },
    { name: "designation", kind: "string", control: "text", label: "Designation", required: false },
    { name: "disclosure", kind: "string", control: "textarea", label: "Disclosure", required: false,
      computed: { source: "disclosure", dependsOn: [["position"], ["designation"]] }
    },
    {
      name: "birthDate", kind: "date", control: "date", label: "Birth Date", required: false
    },
    {
      name: "age", kind: "number", control: "number", label: "Age", required: false,
      computed: {
        expression: {
          op: "dateDiff", unit: "years",
          args: [{ ref: ["birthDate"] }, { op: "now" }]
        }
      }
    }
  ],
  affects: [
    { when: { path: ["password"], op: "notEmpty" }, effect: "show", targets: [["confirmPassword"]] },
    { when: { path: ["email"], op: "eq", value: "pera.peric@email.com" }, effect: "hideAndClear", targets: [["password"], ["confirmPassword"]] },
    { effect: "populate", trigger: ["profile"], source: "profileLookup", allow: ["firstName", "lastName", "password", "confirmPassword", "country", "state", "birthDate"] },
  ],
  layout: [
    { type: "field", name: "profile" },
    {
      type: "section",
      id: "personalInformation",
      title: "Personal Information",
      collapsed: false,
      children: [
        { type: "field", name: "firstName" },
        { type: "field", name: "lastName" },
        { type: "field", name: "fullName" },
        { type: "field", name: "birthDate" },
        { type: "field", name: "age" },
        { type: "field", name: "email" },
      ]
    },
    {
      type: "section",
      id: "security",
      title: "Security",
      collapsed: false,
      children: [
        { type: "field", name: "password" },
        { type: "field", name: "confirmPassword" }
      ]
    },
    {
      type: "section",
      id: "address",
      title: "Location",
      collapsed: false,
      children: [
        { type: "field", name: "country" },
        { type: "field", name: "state" }
      ]
    },
    {
      type: "section",
      id: "disclosures",
      title: "Disclosure",
      collapsed: false,
      children: [
        { type: "field", name: "position" },
        { type: "field", name: "designation" },
        { type: "field", name: "disclosure" }
      ]
    }
  ],
}

/** Stands in for a backend profile lookup. */
const PROFILES: Record<string, PopulateEntry[]> = {
  alice: [
    { name: "firstName", value: "Alice" },
    { name: "lastName", value: "Doe" },
    { name: "password", value: "alice-secret-1" },
    { name: "confirmPassword", value: "alice-secret-1" },
    { name: "country", value: "us" },
    { name: "birthDate", value: "1996-05-21" },
  ],
  bob: [
    { name: "firstName", value: "Bob" },
    { name: "lastName", value: "Doe" },
    { name: "password", value: "bob-secret-1" },
    { name: "confirmPassword", value: "bob-secret-1" },
    { name: "country", value: "de" },
    { name: "state", value: "be" },
    { name: "birthDate", value: "2001-01-29" },
  ],
};

const COUNTRIES: Option[] = [
  { label: "United States", value: "us" },
  { label: "Germany", value: "de" },
];

const STATES_BY_COUNTRY: Record<string, Option[]> = {
  us: [{ label: "California", value: "ca" }, { label: "New York", value: "ny" }],
  de: [{ label: "Bavaria", value: "by" }, { label: "Berlin", value: "be" }],
};

/** Latency the resolvers fake, so the loading and stale-response paths are actually exercised. */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const resolvePopulate: PopulateResolver = async (source, value) => {
  if (source !== "profileLookup") return [];

  await delay(600);
  return PROFILES[value as string] ?? [];
}

const resolveOptions: OptionsResolver = async (source, { deps }) => {
  await delay(500);

  switch (source) {
    case "countries": return COUNTRIES;
    case "states": return STATES_BY_COUNTRY[deps.country as string] ?? [];
    default: return [];
  }
}

const resolveComputed: ComputedResolver = (source, { deps }) => {
  if (source !== "disclosure") return "";

  return deps.position === "Advisor" && deps.designation === "RIA"
    ? "You are a certified agent"
    : "";
}

/** DynamicForm exposes its store, so a button outside the form can drive submit. */
const dynamicForm = useTemplateRef<InstanceType<typeof DynamicForm>>("dynamicForm");

const canSubmit = computed(() => {
  const exposed = dynamicForm.value;
  return !!exposed && !exposed.form.isSubmitting && exposed.form.isValid && !exposed.isPopulating;
});

const logSubmission = (values: unknown) => {
  console.log("[account] submitted", values);
}
</script>

<template>
  <div class="form-demo">
      <h1>Account</h1>

      <DynamicForm
        ref="dynamicForm"
        :definition="accountDefinition"
        :resolve-populate="resolvePopulate"
        :resolve-options="resolveOptions"
        :resolve-computed="resolveComputed"
        submit-label="Create account"
        @submit="logSubmission"
      />

      <button
        type="button"
        class="btn btn-ghost"
        :disabled="!canSubmit"
        @click="dynamicForm && submit(dynamicForm.form)"
      >Submit from outside</button>
  </div>
</template>

<style scoped>
.form-demo {
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

.form-demo h1 {
  margin: 0 0 1.25rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.btn {
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, border-color .15s, opacity .15s;
}

.btn:hover:not(:disabled) {
  background: #f9fafb;
}

.btn-ghost {
  margin-top: 1rem;
  color: #6b7280;
  background: transparent;
  border-style: dashed;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
