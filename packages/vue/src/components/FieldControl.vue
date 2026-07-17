<script setup lang="ts">
import { computed, inject } from "vue";
import { Field } from "@formisch/vue";
import type { Option, PathKey, ValueField } from "@formblatt/core";
import { FormContextKey } from "../form-context";
import type { DynamicFormStore } from "../form-store";
import DynamicInput from "./DynamicInput.vue";

const props = defineProps<{
  of: DynamicFormStore;
  path: PathKey[];
  field: ValueField;
  /** Host-resolved choices, when the field has an `optionsSource`. */
  options?: Option[];
  loading?: boolean;
}>()

// formisch types Field's `path` from the schema; ours is built at runtime (see form-store)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldPath = computed(() => props.path as any);

// optional by design: FieldControl also works outside a DynamicForm, where errors always show
const ctx = inject(FormContextKey, null);
const gatedOnTouch = computed(() => ctx?.errorDisplay === "touched");

// read from the context rather than yet another pass-through prop — every
// placement (layout, section, field, array row) gets it for free
const loadError = computed(() =>
  ctx ? ctx.hasOptionsError(props.path) || ctx.hasComputedError(props.path) : false);

/**
 * formisch validates the whole form, so every field has errors on any trigger.
 * "touched" mode hides them until THIS field was focused or a submit was attempted.
 */
const visibleErrors = (errors: string[] | null, isTouched: boolean) =>
  !gatedOnTouch.value || isTouched || props.of.isSubmitted ? errors : null;
</script>

<template>
  <Field :of="of" :path="fieldPath" v-slot="slot">
    <DynamicInput
      :field="field"
      v-model:input="slot.input"
      :field-props="slot.props"
      :errors="visibleErrors(slot.errors, slot.isTouched)"
      :options="options"
      :loading="loading"
      :load-error="loadError"
    />
  </Field>
</template>
