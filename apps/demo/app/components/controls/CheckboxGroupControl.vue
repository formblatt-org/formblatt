<script setup lang="ts">
import type { ControlProps } from "@formblatt/vue";

const props = defineProps<ControlProps>()
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
  emit("update:input", props.options.filter(choice => next.has(choice.value)).map(choice => choice.value));
};

const isSelected = (value: string) => Array.isArray(props.input) && (props.input as string[]).includes(value);
</script>

<template>
  <!-- registered under the reserved "multiple" key: plain clicks toggle — a <select multiple> would demand ctrl+click, which nobody discovers -->
  <fieldset class="checkbox-group" v-bind="aria">
    <legend v-if="field.label">
      {{ field.label }}
      <span v-if="loading" class="spinner-sm" aria-hidden="true" />
    </legend>
    <label v-for="choice in options" :key="choice.value" class="checkbox-option">
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
