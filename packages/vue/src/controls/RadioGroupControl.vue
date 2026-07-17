<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()
</script>

<template>
  <!-- radios label each option, so the group is a fieldset, not another label -->
  <fieldset class="radio-group" role="radiogroup" v-bind="aria">
    <legend v-if="field.label">{{ field.label }}</legend>
    <label v-for="choice in choices" :key="choice.value" class="radio-option">
      <input
        type="radio"
        :name="fieldProps.name"
        :value="choice.value"
        :checked="input === choice.value"
        :disabled="disabled"
        @change="emit('update:input', choice.value)"
        @blur="fieldProps.onBlur"
      />
      <span>{{ choice.label }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.radio-group {
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

.radio-option {
  display: flex;
  align-items: center;
  gap: .45rem;
  padding: .15rem 0;
  font-size: .9rem;
  color: var(--fb-color-text, #1f2937);
  cursor: pointer;
}

.radio-option input {
  flex: none;
  width: auto;
  margin: 0;
  padding: 0;
}
</style>
