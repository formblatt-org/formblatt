<script setup lang="ts">
import { computed, provide } from "vue";
import { Form, reset, useForm } from "@formisch/vue";
import {
  buildFormSchema,
  buildInitialInput,
  evaluate,
  isValueField,
  migrateDefinition,
  normalizeLayout,
  resolveNodes,
  validateDefinition,
  warn,
} from "@formblatt/core";
import type {
  ComputedResolver,
  FieldDefinition,
  FormDefinition,
  OptionsResolver,
  PopulateResolver,
  ValueField,
} from "@formblatt/core";
import { FormContextKey, type ErrorDisplay, type ResolvedSection } from "../form-context";
import { createReader } from "../form-store";
import { useCoverageWarnings } from "../internal/coverage";
import { useAffects } from "../composables/useAffects";
import { usePopulate } from "../composables/usePopulate";
import { useOptions } from "../composables/useOptions";
import { useComputed } from "../composables/useComputed";
import DynamicLayout from "./DynamicLayout.vue";

const props = defineProps<{
  definition: FormDefinition;
  resolvePopulate: PopulateResolver;
  resolveOptions: OptionsResolver;
  resolveComputed: ComputedResolver;
  /** `"touched"` hides a field's errors until it is focused or a submit is attempted. Default: `"always"`. */
  errorDisplay?: ErrorDisplay;
  /** Label of the default submit button. Ignored when the default slot is replaced. */
  submitLabel?: string;
}>()

const emit = defineEmits<{ submit: [values: unknown] }>()

// Migrated and validated once at setup: a changed definition prop needs a :key
// remount anyway, since useForm builds its store only once.
const definition = validateDefinition(migrateDefinition(props.definition));

const form = useForm({
  schema: buildFormSchema(definition),
  initialInput: buildInitialInput(definition),
  validate: definition.validate,
  revalidate: definition.revalidate,
})

const read = createReader(form);

const fieldsByName = computed<Record<string, FieldDefinition>>(() =>
  Object.fromEntries(definition.fields.map(field => [field.name, field])));

const resolvedLayout = computed(() =>
  resolveNodes(normalizeLayout(definition), fieldsByName.value));

const { isVisible } = useAffects(form, definition);
const { isPopulating } = usePopulate(form, definition, props.resolvePopulate);
const { optionsFor, isLoadingOptions } = useOptions(form, definition, props.resolveOptions);
const { isComputing } = useComputed(form, definition, props.resolveComputed);
const { register, unregister } = useCoverageWarnings(definition);

const resolveField = (name: string): ValueField | undefined => {
  const field = fieldsByName.value[name];
  if (!field) {
    warn("form", `unknown field "${name}"`);
    return undefined;
  }
  return isValueField(field) ? field : undefined;
}

/** A section renders while its own condition holds AND it still has a visible field — an empty box never renders. */
const isSectionVisible = (section: ResolvedSection): boolean =>
  evaluate(section.visibleWhen, read) &&
  section.children.some(child => child.type === "field" && isVisible(child.path));

const submitForm = (values: unknown) => {
  // a disabled button does not stop submit(form) or requestSubmit()
  if (isPopulating.value) return;
  emit("submit", values);
}

provide(FormContextKey, {
  form,
  definition,
  errorDisplay: props.errorDisplay ?? "always",
  resolvedLayout,
  resolveField,
  isVisible,
  isSectionVisible,
  optionsFor,
  isLoadingOptions,
  isComputing,
  register,
  unregister,
})

defineExpose({ form, isPopulating })
</script>

<template>
  <Form :of="form" class="dynamic-form" @submit="submitForm">
    <!--
      populate writes many fields at once, so the whole form blocks. inert stops
      clicks, focus and tabbing in one attribute; `|| undefined` matters because
      SSR serialises `:inert="false"` as a present — and therefore active — attribute.
    -->
    <div
      class="busy-region"
      :class="{ 'is-busy': isPopulating }"
      :inert="isPopulating || undefined"
      :aria-busy="isPopulating"
    >
      <!-- Opening this slot replaces the fallback entirely — render <DynamicLayout /> yourself. -->
      <slot
        :form="form"
        :is-valid="form.isValid"
        :is-submitting="form.isSubmitting"
        :is-populating="isPopulating"
        :is-computing="isComputing"
        :is-loading-options="isLoadingOptions"
      >
        <DynamicLayout />

        <div class="actions">
          <button type="submit" class="btn btn-primary" :disabled="form.isSubmitting || !form.isValid || isPopulating">
            {{ form.isSubmitting ? 'Submitting…' : (submitLabel ?? 'Submit') }}
          </button>
          <button type="button" class="btn" @click="reset(form)">Reset</button>
        </div>
      </slot>
    </div>

    <div v-if="isPopulating" class="busy-overlay" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </div>
  </Form>
</template>

<style scoped>
/* Only a positioning context on <form> — headless consumers put their own grid inside it. */
.dynamic-form {
  position: relative;
}

.busy-region.is-busy {
  opacity: .5;
  transition: opacity .15s;
}

.busy-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-auto-flow: column;
  gap: .6rem;
  place-content: center;
  align-items: center;
  pointer-events: none;
  font-size: .9rem;
  color: #374151;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.actions {
  display: flex;
  gap: .625rem;
  margin-top: 1rem;
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

.btn-primary {
  color: #fff;
  background: #4f46e5;
  border-color: #4f46e5;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
