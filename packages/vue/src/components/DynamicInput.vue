<script setup lang="ts">
import { computed, inject, useId, type Component } from "vue";
import { controlKeyFor, interpolate, warn } from "@formblatt/core";
import type { Option, ValueField } from "@formblatt/core";
import { DEFAULT_UI_TEXT, FormContextKey } from "../form-context";
import type { FieldBindings } from "../form-store";
import { GlobalControlsKey } from "../plugin";

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
  /** Overrides the registry — for use outside a DynamicForm. */
  controls?: Record<string, Component>;
}>()

const emit = defineEmits<{ "update:input": [value: unknown] }>()

const choices = computed<readonly Option[]>(() => props.options ?? props.field.options ?? []);

// optional by design: DynamicInput also works outside a DynamicForm, with
// English defaults and the app-wide registry (or the `controls` prop)
const ctx = inject(FormContextKey, null);
const globalControls = inject(GlobalControlsKey, undefined);
const text = computed(() => ctx?.text.value ?? DEFAULT_UI_TEXT);

/**
 * The registry this field renders from: inside a DynamicForm the context's
 * (app-wide merged with the form's), standalone the app-wide one — the
 * `controls` prop overrides either.
 */
const registry = computed<Record<string, Component>>(() =>
  ({ ...(ctx?.controls ?? globalControls), ...props.controls }));

const controlKey = computed(() => controlKeyFor(props.field));
const control = computed<Component | undefined>(() => registry.value[controlKey.value]);

/**
 * Unreachable inside a DynamicForm — an unregistered key already rejected the
 * definition at mount. Standalone (no such gate) the scaffold renders the
 * miss in place and says which key to register.
 */
const missingText = computed(() =>
  interpolate(text.value.controlMissing, { control: controlKey.value }));

if (!control.value) {
  warn("form", `no control registered for "${controlKey.value}" — field "${props.field.name}" renders its error state`);
}

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

/** The uniform props every control receives. See {@link ControlProps}. */
const controlProps = computed(() => ({
  field: props.field,
  input: props.input,
  fieldProps: props.fieldProps,
  aria: aria.value,
  options: choices.value,
  disabled: isDisabled.value,
  loading: !!props.loading,
  loadError: !!props.loadError,
  text: text.value,
}));
</script>

<template>
    <div class="field" :class="{ 'is-loading': loading }" :aria-busy="loading">
    <!-- the control renders its own label; the scaffold keeps the error list and aria wiring -->
    <component
      :is="control"
      v-if="control"
      v-bind="controlProps"
      @update:input="emit('update:input', $event)"
    />

    <!-- a field nothing can render explains itself instead of leaving a silent hole -->
    <p v-else class="field-control-missing" role="alert">{{ missingText }}</p>

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

.field-control-missing {
  margin: 0;
  color: var(--fb-color-error, #dc2626);
  font-size: .8rem;
}
</style>
