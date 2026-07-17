<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onInput = (event: Event) => {
  emit("update:input", (event.target as HTMLTextAreaElement).value);
};
</script>

<template>
  <!-- a real <textarea> — as <input type="textarea"> browsers would render a single-line text input -->
  <textarea
    class="fb-control"
    v-bind="{ ...fieldProps, ...aria }"
    :disabled="disabled"
    :value="(input as string | undefined)"
    @input="onInput"
  />
</template>
