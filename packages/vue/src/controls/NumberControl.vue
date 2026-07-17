<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

/**
 * An emptied number input reports `valueAsNumber` as `NaN` — store `undefined`
 * instead, so required/optional semantics apply rather than a NaN type error.
 */
const onInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).valueAsNumber;
  emit("update:input", Number.isNaN(value) ? undefined : value);
};
</script>

<template>
  <input
    class="fb-control"
    type="number"
    v-bind="{ ...fieldProps, ...aria }"
    :disabled="disabled"
    :value="input"
    @input="onInput"
  />
</template>
