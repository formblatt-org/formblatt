<script setup lang="ts">
import type { ControlProps } from "@formblatt/vue";
import ControlShell from "./ControlShell.vue";

defineProps<ControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onInput = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).value);
};
</script>

<template>
  <ControlShell :label="field.label" :loading="loading">
    <!-- registered for text/email/password/date alike: the control name IS the input type -->
    <input
      class="fb-control"
      :type="field.control ?? 'text'"
      v-bind="{ ...fieldProps, ...aria }"
      :disabled="disabled"
      :value="input"
      @input="onInput"
    />
  </ControlShell>
</template>
