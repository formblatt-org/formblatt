<script setup lang="ts">
import type { ControlProps } from "@formblatt/vue";
import ControlShell from "./ControlShell.vue";

defineProps<ControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onInput = (event: Event) => {
  emit("update:input", (event.target as HTMLTextAreaElement).value);
};
</script>

<template>
  <ControlShell :label="field.label" :loading="loading">
    <!-- a real <textarea> — as <input type="textarea"> browsers would render a single-line text input -->
    <textarea
      class="fb-control"
      v-bind="{ ...fieldProps, ...aria }"
      :disabled="disabled"
      :value="(input as string | undefined)"
      @input="onInput"
    />
  </ControlShell>
</template>
