<script setup lang="ts">
import { computed, inject, useId } from "vue";
import type { Option, ValueField } from "@formblatt/core";
import { DEFAULT_UI_TEXT, FormContextKey } from "../form-context";
import type { FieldBindings } from "../form-store";
import { BUILT_IN_CONTROL_ENTRIES, GENERIC_CONTROL, MULTIPLE_CONTROL, type ControlEntry } from "../controls/registry";

const props = defineProps<{
  field: ValueField;
  input: unknown;
  /** The field's element bindings (name, ref, event handlers) — spread onto the control. */
  fieldProps: FieldBindings;
  errors: string[] | null;
  /** Host-resolved choices; falls back to the field's static `options`. */
  options?: Option[];
  loading?: boolean;
  /** The field's host-resolved options or computed value failed to load. */
  loadError?: boolean;
}>()

const emit = defineEmits<{ "update:input": [value: unknown] }>()

const choices = computed<readonly Option[]>(() => props.options ?? props.field.options ?? []);

// optional by design: DynamicInput also works outside a DynamicForm, with English defaults
const ctx = inject(FormContextKey, null);
const text = computed(() => ctx?.text.value ?? DEFAULT_UI_TEXT);

/** A host-registered control matching this field's `control` name, if any. */
const customControl = computed(() =>
  props.field.control ? ctx?.controls[props.field.control] : undefined);

/**
 * The built-in control to render: the registry entry for the `control` name,
 * except a `multiple` enum renders as a checkbox group (radio wins over
 * `multiple`, matching the pre-registry behavior) and unmatched names fall
 * through to the generic input.
 */
const entry = computed<ControlEntry>(() => {
  const named = BUILT_IN_CONTROL_ENTRIES[props.field.control ?? "text"];
  if (props.field.control === "radio" && named) return named;
  if (props.field.multiple) return MULTIPLE_CONTROL;
  return named ?? GENERIC_CONTROL;
});

/** The uniform props every built-in control receives. See controls/contract.ts. */
const controlProps = computed(() => ({
  field: props.field,
  input: props.input,
  fieldProps: props.fieldProps,
  aria: aria.value,
  choices: choices.value,
  disabled: isDisabled.value,
  loading: !!props.loading,
  text: text.value,
}));

/** A control is disabled while its choices load, or statically by the definition. */
const isDisabled = computed(() => props.loading || !!props.field.disabled);

const errorsId = useId();
const isInvalid = computed(() => !!props.errors?.length);

/** Static approximation — a visibility-conditional required varies at runtime, which aria can live with. */
const isRequired = computed(() =>
  props.field.required !== false && !props.field.disabled && !props.field.computed);

/**
 * The accessibility contract of every control: it reports invalid, points at
 * its error list, and announces required-ness. Spread AFTER `fieldProps`.
 */
const aria = computed(() => ({
  "aria-invalid": isInvalid.value || undefined,
  "aria-describedby": isInvalid.value ? errorsId : undefined,
  "aria-required": isRequired.value || undefined,
}));
</script>

<template>
    <div class="field" :class="{ 'is-loading': loading }" :aria-busy="loading">
    <!-- a host-registered control renders its own label; the scaffold keeps the error list -->
    <component
      :is="customControl"
      v-if="customControl"
      :field="field"
      :input="input"
      :field-props="fieldProps"
      :aria="aria"
      :options="choices"
      :loading="!!loading"
      :disabled="isDisabled"
      :load-error="!!loadError"
      @update:input="emit('update:input', $event)"
    />

    <!-- group controls (radio, multi-enum checkboxes) render their own fieldset + legend -->
    <component
      :is="entry.component"
      v-else-if="entry.group"
      v-bind="controlProps"
      @update:input="emit('update:input', $event)"
    />

    <label v-else>
        <span v-if="field.label">
          {{ field.label }}
          <!-- controls with their own indicator (select) show it in place instead -->
          <span v-if="loading && !entry.ownLoadingIndicator" class="spinner-sm" aria-hidden="true" />
        </span>

        <component :is="entry.component" v-bind="controlProps" @update:input="emit('update:input', $event)" />
    </label>

    <!-- a resolver failure is a system problem, not a validation error — its own line, amber not red -->
    <p v-if="loadError" class="field-load-error" role="alert">{{ text.loadFailed }}</p>

    <!-- role="alert" announces newly appearing errors to screen readers -->
    <ul v-if="errors" :id="errorsId" role="alert" class="field-errors">
      <li v-for="error in errors" :key="error">{{ error }}</li>
    </ul>
    </div>
</template>

<style scoped>
/* Every color/radius reads a --fb-* token with the shipped value as fallback — see the README. */

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
  color: var(--fb-color-label, #374151);
}

.spinner-sm {
  width: 11px;
  height: 11px;
  border: 2px solid var(--fb-color-border-soft, #e5e7eb);
  border-top-color: var(--fb-color-primary, #4f46e5);
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.field-errors {
  margin: .4rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--fb-color-error, #dc2626);
  font-size: .8rem;
}

.field-load-error {
  margin: .4rem 0 0;
  color: var(--fb-color-warning, #b45309);
  font-size: .8rem;
}
</style>

<!-- UNSCOPED on purpose: the base control styling must reach the registry's
     control components (child DOM a scoped selector cannot see). Only elements
     carrying the fb-control class are affected — host custom controls are not. -->
<style>
.fb-control {
  width: 100%;
  box-sizing: border-box;
  padding: .5rem .625rem;
  font: inherit;
  font-size: .9rem;
  color: var(--fb-color-text, #1f2937);
  background: var(--fb-color-surface, #fff);
  border: 1px solid var(--fb-color-border, #d1d5db);
  border-radius: var(--fb-radius, 8px);
  transition: border-color .15s, box-shadow .15s;
}

textarea.fb-control {
  min-height: 4.5rem;
  resize: vertical;
}

.fb-control:focus {
  outline: none;
  border-color: var(--fb-color-primary, #4f46e5);
  box-shadow: var(--fb-focus-ring, 0 0 0 3px rgba(79, 70, 229, .15));
}

.fb-control[type="checkbox"] {
  width: auto;
  margin-right: .5rem;
  vertical-align: middle;
}

.fb-control:disabled {
  color: var(--fb-color-disabled-text, #9ca3af);
  background: var(--fb-color-disabled-bg, #f3f4f6);
  cursor: not-allowed;
}
</style>
