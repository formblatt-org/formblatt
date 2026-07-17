<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onChange = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).checked);
};
</script>

<template>
  <input
    class="fb-control"
    type="checkbox"
    v-bind="{ ...fieldProps, ...aria }"
    :disabled="disabled"
    :checked="!!input"
    @change="onChange"
  />
</template>
