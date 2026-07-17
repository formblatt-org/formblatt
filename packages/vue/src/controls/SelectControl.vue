<script setup lang="ts">
import type { BuiltInControlProps } from "./contract";

defineProps<BuiltInControlProps>()
const emit = defineEmits<{ "update:input": [value: unknown] }>()

/**
 * The placeholder option's `""` means "no selection", not a value — store
 * `undefined`, so an optional enum passes and a required one reports missing.
 */
const onChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:input", value === "" ? undefined : value);
};
</script>

<template>
  <!-- an <option> can only hold text, so the spinner is overlaid and the text shifted right -->
  <div class="select-wrap" :class="{ 'is-loading': loading }">
    <span v-if="loading" class="spinner-select" aria-hidden="true" />

    <select class="fb-control" v-bind="{ ...fieldProps, ...aria }" :value="input" :disabled="disabled" @change="onChange">
      <option value="">{{ loading ? text.loading : text.selectPlaceholder }}</option>
      <option v-for="choice in choices" :key="choice.value" :value="choice.value">
        {{ choice.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.select-wrap {
  position: relative;
}

.spinner-select {
  position: absolute;
  left: .65rem;
  top: 50%;
  margin-top: -6px; /* half the height — avoids translateY, which the spin keyframe would overwrite */
  width: 12px;
  height: 12px;
  border: 2px solid var(--fb-color-border, #d1d5db);
  border-top-color: var(--fb-color-primary, #4f46e5);
  border-radius: 50%;
  animation: spin .6s linear infinite;
  pointer-events: none;
}

/* make room for the spinner so it sits in front of the "Loading…" text */
.select-wrap.is-loading select {
  padding-left: 2.05rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
