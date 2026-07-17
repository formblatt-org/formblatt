<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

const props = defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

/**
 * Toggles one choice of a `multiple` enum. The stored `string[]` is rebuilt in
 * option order, so the submitted value doesn't depend on click order — `[]`
 * when nothing is checked.
 */
const onToggle = (value: string, event: Event) => {
  const next = new Set(Array.isArray(props.input) ? (props.input as string[]) : []);
  if ((event.target as HTMLInputElement).checked) next.add(value);
  else next.delete(value);
  emit("update:input", props.choices.filter(choice => next.has(choice.value)).map(choice => choice.value));
};

const isSelected = (value: string) => Array.isArray(props.input) && (props.input as string[]).includes(value);
</script>

<template>
  <!-- a multi-enum is a checkbox group: plain clicks toggle — a <select multiple> would demand ctrl+click, which nobody discovers -->
  <fieldset class="checkbox-group" v-bind="aria">
    <legend v-if="field.label">
      {{ field.label }}
      <span v-if="loading" class="spinner-sm" aria-hidden="true" />
    </legend>
    <label v-for="choice in choices" :key="choice.value" class="checkbox-option">
      <input
        type="checkbox"
        :name="fieldProps.name"
        :value="choice.value"
        :checked="isSelected(choice.value)"
        :disabled="disabled"
        @change="onToggle(choice.value, $event)"
        @blur="fieldProps.onBlur"
      />
      <span>{{ choice.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.checkbox-group {
  margin: 0;
  padding: 0;
  border: none;
}

legend {
  display: flex;
  align-items: center;
  gap: .4rem;
  margin-bottom: .35rem;
  padding: 0;
  font-size: .85rem;
  font-weight: 550;
  color: var(--fb-color-label, #374151);
}

.spinner-sm {
  width: 11px;
  height: 11px;
  border: 2px solid var(--fb-color-border-soft, #e5e7eb);
  border-top-color: var(--fb-color-primary, #4f46e5);
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: .15rem 0;
  font-size: .9rem;
  color: var(--fb-color-text, #1f2937);
  cursor: pointer;
}

.checkbox-option input {
  flex: none;
  width: auto;
  margin: 0;
  padding: 0;
}
</style>
