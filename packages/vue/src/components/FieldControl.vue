<script setup lang="ts">
import { computed, inject, type Component } from "vue";
import { Field } from "@formisch/vue";
import type { Option, PathKey, ValueField } from "@formblatt/core";
import { FormContextKey } from "../form-context";
import type { DynamicFormStore } from "../form-store";
import DynamicInput from "./DynamicInput.vue";

const props = defineProps<{
  of: DynamicFormStore;
  path: PathKey[];
  field: ValueField;
  /** Overrides the context's host-resolved choices — for use outside a DynamicForm. */
  options?: Option[];
  /** Overrides the context's loading state — for use outside a DynamicForm. */
  loading?: boolean;
  /** Overrides the control registry — for use outside a DynamicForm. */
  controls?: Record<string, Component>;
}>()

// formisch types Field's `path` from the schema; ours is built at runtime (see form-store)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldPath = computed(() => props.path as any);

// optional by design: FieldControl also works outside a DynamicForm, where errors always show
const ctx = inject(FormContextKey, null);
const gatedOnTouch = computed(() => ctx?.errorDisplay === "touched");

// options, loading and error state are read from the context rather than
// passed through by every placement (layout, section, field, array row) —
// one prop contract, four call sites that cannot drift
const options = computed(() => props.options ?? ctx?.optionsFor(props.path));
const loading = computed(() =>
  props.loading ?? (ctx ? ctx.isLoadingOptions(props.path) || ctx.isComputing(props.path) : false));
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
      :controls="controls"
    />
  </Field>
</template>
