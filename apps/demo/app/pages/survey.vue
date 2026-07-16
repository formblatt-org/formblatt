<script setup lang="ts">
import { ref } from "vue";
import type { FormDefinition } from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";
import StarRating from "../components/StarRating.vue";

/**
 * Every control flavor in one form: a host-registered star rating (the
 * `controls` registry), a radio group, a multi-enum checkbox group and a textarea —
 * with `errorDisplay: "touched"`, so validating from mount never yells at an
 * untouched field.
 */
const surveyDefinition: FormDefinition = {
  id: "product-feedback-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      // `control: "rating"` is not a built-in — it renders the registered component
      name: "overall", kind: "number", control: "rating", label: "How satisfied are you overall?",
      requiredMessage: "Please pick a rating",
    },
    {
      name: "recommend", kind: "enum", control: "radio", label: "Would you recommend formblatt?",
      options: [
        { label: "Definitely", value: "yes" },
        { label: "Maybe", value: "maybe" },
        { label: "Not yet", value: "no" },
      ],
    },
    {
      // `multiple` stores a string[] — rendered as a checkbox group
      name: "usedFeatures", kind: "enum", multiple: true, label: "Which capabilities do you use?",
      requiredMessage: "Pick at least one",
      options: [
        { label: "Validation rules", value: "validation" },
        { label: "Multi-step wizards", value: "wizard" },
        { label: "Field arrays", value: "arrays" },
        { label: "Computed fields", value: "computed" },
        { label: "Populate lookups", value: "populate" },
        { label: "Localization", value: "i18n" },
      ],
    },
    {
      name: "heardAbout", kind: "enum", control: "select", label: "How did you hear about it?", required: false,
      options: [
        { label: "GitHub", value: "github" },
        { label: "npm", value: "npm" },
        { label: "A colleague or friend", value: "friend" },
        { label: "A conference talk", value: "conference" },
      ],
    },
    {
      name: "comments", kind: "string", control: "textarea", label: "Anything else?", required: false,
      validations: [{ type: "maxLength", value: 500, message: "Keep it under 500 characters" }],
    },
  ],
};

const submitted = ref<unknown>(null);

const sendFeedback = (values: unknown) => {
  submitted.value = values;
}
</script>

<template>
  <div class="survey-demo">
    <h1>Product feedback</h1>
    <p class="tagline">
      A survey built from the open control set: a custom star-rating control registered via
      <code>controls</code>, a radio group, a multi-enum checkbox group — errors stay hidden
      until a field was touched.
    </p>

    <div v-if="submitted" class="thanks">
      <h2>Thank you!</h2>
      <p>Your feedback helps shape the roadmap.</p>
      <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
    </div>

    <DynamicForm
      v-else
      :definition="surveyDefinition"
      :controls="{ rating: StarRating }"
      error-display="touched"
      submit-label="Send feedback"
      @submit="sendFeedback"
    />
  </div>
</template>

<style scoped>
.survey-demo {
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

.survey-demo h1 {
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
  margin: 0;
  font-size: .875rem;
}

.thanks pre {
  margin: .75rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}
</style>
