<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

const onInput = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).value);
};
</script>

<template>
  <!-- also the fallback for unregistered control names: browsers render an unknown `type` as text -->
  <input
    class="fb-control"
    :type="field.control ?? 'text'"
    v-bind="{ ...fieldProps, ...aria }"
    :disabled="disabled"
    :value="input"
    @input="onInput"
  />
</template>
