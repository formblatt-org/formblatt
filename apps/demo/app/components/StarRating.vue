<script setup lang="ts">
import { computed, ref } from "vue";
import type { ControlProps } from "@formblatt/vue";

/**
 * A host-registered control: receives `ControlProps` from the field
 * scaffold and reports the picked value through `update:input`. The scaffold
 * keeps the error list and aria wiring — the control renders its own label
 * and spreads `aria` onto the interactive element.
 */
const props = defineProps<ControlProps>();

const emit = defineEmits<{ "update:input": [value: unknown] }>();

const STARS = [1, 2, 3, 4, 5];

const hovered = ref(0);

const value = computed(() => (typeof props.input === "number" ? props.input : 0));

/** Hover previews; the stored value paints once the pointer leaves. */
const shown = computed(() => hovered.value || value.value);

/** Forwards blur to formisch, so touched-gated error display works. */
const onFocusOut = (event: FocusEvent) => {
  (props.fieldProps.onBlur as ((event: FocusEvent) => void) | undefined)?.(event);
};
</script>

<template>
  <div class="star-rating">
    <span v-if="field.label" class="rating-label">{{ field.label }}</span>
    <div
      class="stars"
      role="radiogroup"
      :aria-label="field.label"
      v-bind="aria"
      @mouseleave="hovered = 0"
      @focusout="onFocusOut"
    >
      <button
        v-for="star in STARS"
        :key="star"
        type="button"
        role="radio"
        class="star"
        :class="{ 'is-filled': star <= shown }"
        :aria-checked="star === value"
        :aria-label="`${star} star${star > 1 ? 's' : ''}`"
        :disabled="disabled"
        @mouseenter="hovered = star"
        @click="emit('update:input', star)"
      >★</button>
      <span v-if="value" class="value-text">{{ value }} / 5</span>
    </div>
  </div>
</template>

<style scoped>
.rating-label {
  display: block;
  margin-bottom: .35rem;
  font-size: .85rem;
  font-weight: 550;
  color: #374151;
}

.stars {
  display: flex;
  align-items: center;
  gap: .1rem;
}

.star {
  padding: 0 .1rem;
  font-size: 1.5rem;
  line-height: 1;
  color: #d1d5db;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color .1s, transform .1s;
}

.star:hover {
  transform: scale(1.15);
}

.star.is-filled {
  color: #f59e0b;
}

.star:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.value-text {
  margin-left: .5rem;
  font-size: .85rem;
  color: #6b7280;
}
</style>
