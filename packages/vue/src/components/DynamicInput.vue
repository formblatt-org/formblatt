<script setup lang="ts">
import { computed } from "vue";
import type { FieldElementProps } from "@formisch/vue";
import type { Option, ValueField } from "@formblatt/core";

const props = defineProps<{
  field: ValueField;
  input: unknown;
  /** formisch's element bindings (name, ref, event handlers) — spread onto the control. */
  fieldProps: FieldElementProps;
  errors: string[] | null;
  /** Host-resolved choices; falls back to the field's static `options`. */
  options?: Option[];
  loading?: boolean;
}>()

const emit = defineEmits<{ "update:input": [value: unknown] }>()

const choices = computed<readonly Option[]>(() => props.options ?? props.field.options ?? []);

/**
 * An emptied number input reports `valueAsNumber` as `NaN` — store `undefined`
 * instead, so required/optional semantics apply rather than a NaN type error.
 */
const onNumberInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).valueAsNumber;
  emit("update:input", Number.isNaN(value) ? undefined : value);
};

/**
 * The placeholder option's `""` means "no selection", not a value — store
 * `undefined`, so an optional enum passes and a required one reports missing.
 */
const onSelectChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:input", value === "" ? undefined : value);
};

const onCheckboxChange = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).checked);
};

const onTextInput = (event: Event) => {
  emit("update:input", (event.target as HTMLInputElement).value);
};
</script>

<template>
    <div class="field" :class="{ 'is-loading': loading }" :aria-busy="loading">
    <label>
        <span v-if="field.label">
          {{ field.label }}
          <!-- selects show their spinner inside the control instead -->
          <span v-if="loading && field.control !== 'select'" class="spinner-sm" aria-hidden="true" />
        </span>

        <!-- an <option> can only hold text, so the spinner is overlaid and the text shifted right -->
        <div v-if="field.control === 'select'" class="select-wrap" :class="{ 'is-loading': loading }">
          <span v-if="loading" class="spinner-select" aria-hidden="true" />
          <select v-bind="fieldProps" :value="input" :disabled="loading" @change="onSelectChange">
            <option value="">{{ loading ? 'Loading…' : '— Select —' }}</option>
            <option v-for="choice in choices" :key="choice.value" :value="choice.value">
              {{ choice.label }}
            </option>
          </select>
        </div>

        <input v-else-if="field.control === 'checkbox'" type="checkbox" v-bind="fieldProps"
            :disabled="loading" :checked="!!input" @change="onCheckboxChange" />

        <input v-else-if="field.control === 'number'" type="number" v-bind="fieldProps"
            :disabled="loading" :value="input" @input="onNumberInput" />

        <input v-else :type="field.control ?? 'text'" v-bind="fieldProps"
            :disabled="loading" :value="input" @input="onTextInput" />
    </label>

    <ul v-if="errors" class="field-errors">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>
    </div>
</template>

<style scoped>
.field label {
  display: block;
}

.field > label > span {
  display: flex;
  align-items: center;
  gap: .4rem;
  margin-bottom: .35rem;
  font-size: .85rem;
  font-weight: 550;
  color: #374151;
}

.spinner-sm {
  width: 11px;
  height: 11px;
  border: 2px solid #e5e7eb;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

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
  border: 2px solid #d1d5db;
  border-top-color: #4f46e5;
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

.field input,
.field select {
  width: 100%;
  box-sizing: border-box;
  padding: .5rem .625rem;
  font: inherit;
  font-size: .9rem;
  color: #1f2937;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  transition: border-color .15s, box-shadow .15s;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, .15);
}

.field input[type="checkbox"] {
  width: auto;
  margin-right: .5rem;
  vertical-align: middle;
}

.field input:disabled,
.field select:disabled {
  color: #9ca3af;
  background: #f3f4f6;
  cursor: not-allowed;
}

.field-errors {
  margin: .4rem 0 0;
  padding: 0;
  list-style: none;
  color: #dc2626;
  font-size: .8rem;
}
</style>
