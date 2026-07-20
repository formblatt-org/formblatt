<script setup lang="ts">
import type { ControlProps } from "@formblatt/vue";
import ControlShell from "./ControlShell.vue";

defineProps<ControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onChange = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).checked);
};
</script>

<template>
  <ControlShell :label="field.label" :loading="loading">
    <input
      class="fb-control"
      type="checkbox"
      v-bind="{ ...fieldProps, ...aria }"
      :disabled="disabled"
      :checked="!!input"
      @change="onChange"
    />
  </ControlShell>
</template>
