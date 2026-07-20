<script setup lang="ts">
/**
 * The label wrap shared by the single-element controls. formblatt is headless
 * — the field scaffold keeps errors and aria, the control owns its label.
 */
defineProps<{ label?: string; loading?: boolean }>()
</script>

<template>
  <label class="control-shell">
    <span v-if="label" class="control-label">
      {{ label }}
      <span v-if="loading" class="spinner-sm" aria-hidden="true" />
    </span>
    <slot />
  </label>
</template>
