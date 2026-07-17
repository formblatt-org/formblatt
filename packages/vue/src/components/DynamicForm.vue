<script setup lang="ts">
import { computed, nextTick, onMounted, provide, useTemplateRef, type Component, type ComponentPublicInstance } from "vue";
import { Form, reset, useForm } from "@formisch/vue";
import {
  buildFormSchema,
  buildInitialInput,
  evaluate,
  isValueField,
  migrateDefinition,
  normalizeLayout,
  reportError,
  resolveFieldByNamePath,
  resolveNodes,
  validateDefinition,
  warn,
} from "@formblatt/core";
import type {
  ComputedResolver,
  FieldDefinition,
  FormDefinition,
  MessageCatalog,
  OptionsResolver,
  PopulateResolver,
  ValidationFactory,
  ValidationResolver,
  ValueField,
} from "@formblatt/core";
import {
  DEFAULT_UI_TEXT,
  FormContextKey,
  type ErrorDisplay,
  type ResolvedSection,
  type SubmitContext,
  type SubmitHandler,
  type UiText,
} from "../form-context";
import { createReader, isFormDirty, writeFieldErrors } from "../form-store";
import { useCoverageWarnings } from "../internal/coverage";
import { focusFirstInvalid } from "../internal/focus";
import { useAffects } from "../composables/useAffects";
import { usePopulate } from "../composables/usePopulate";
import { useOptions } from "../composables/useOptions";
import { useComputed } from "../composables/useComputed";
import { usePages } from "../composables/usePages";
import DynamicLayout from "./DynamicLayout.vue";

const props = defineProps<{
  definition: FormDefinition;
  /**
   * Host data to hydrate the form with (an edit workflow's saved record),
   * merged over the definition's `initial` values. Read once at mount —
   * remount with `:key` to re-hydrate.
   */
  initialData?: Record<string, unknown>;
  /** Required only when the definition declares `populate` affects — a warning tells you when it's missing. */
  resolvePopulate?: PopulateResolver;
  /** Required only when the definition declares `optionsSource` fields. */
  resolveOptions?: OptionsResolver;
  /** Required only when the definition declares source-mode `computed` fields. */
  resolveComputed?: ComputedResolver;
  /** Required only when the definition declares `remote` validation rules. */
  resolveValidation?: ValidationResolver;
  /** Host-defined validation rules, addressable from any field's `validations` by key. */
  rules?: Record<string, ValidationFactory>;
  /** Host-registered controls by name — a field's `control` outside the built-ins renders these. */
  controls?: Record<string, Component>;
  /** `"touched"` hides a field's errors until it is focused or a submit is attempted. Default: `"always"`. */
  errorDisplay?: ErrorDisplay;
  /** Label of the default submit button. Ignored when the default slot is replaced. */
  submitLabel?: string;
  /** Overrides for the built-in UI strings — the i18n hook. Merged over English defaults. */
  text?: Partial<UiText>;
  /**
   * Message templates for validation errors, keyed by rule type (plus
   * `required` / `isoDate` / `picklist`), interpolating `{field}` and
   * `{value}`. Compiled into the schema at mount — remount for a locale change.
   */
  messages?: MessageCatalog;
  /**
   * `@submit` — called with the parsed values once the schema passed. Declared
   * as a prop (not an emit) so an async handler can be awaited: the form stays
   * `isSubmitting` until it settles, and server-side errors map back through
   * the context's `setFieldErrors`.
   */
  onSubmit?: SubmitHandler;
}>()

const text = computed<UiText>(() => ({ ...DEFAULT_UI_TEXT, ...props.text }));

// Migrated and validated once at setup: a changed definition prop needs a :key
// remount anyway, since useForm builds its store only once.
const definition = validateDefinition(migrateDefinition(props.definition), {
  customRuleTypes: props.rules && Object.keys(props.rules),
  controls: props.controls && Object.keys(props.controls),
});

const form = useForm({
  // the schema is built once, so a locale change to `text.requiredMessage` needs a :key remount
  schema: buildFormSchema(definition, {
    requiredMessage: text.value.requiredMessage,
    messages: props.messages,
    rules: props.rules,
    validationResolver: props.resolveValidation,
  }),
  initialInput: buildInitialInput(definition, props.initialData),
  validate: definition.validate,
  revalidate: definition.revalidate,
})

const read = createReader(form);

const fieldsByName = computed<Record<string, FieldDefinition>>(() =>
  Object.fromEntries(definition.fields.map(field => [field.name, field])));

const resolvedLayout = computed(() =>
  resolveNodes(normalizeLayout(definition), definition.fields));

const { isVisible } = useAffects(form, definition);
const { isPopulating, hasPopulateError } = usePopulate(form, definition, props.resolvePopulate);
const { optionsFor, isLoadingOptions, isLoadingAnyOptions, hasOptionsError } = useOptions(form, definition, props.resolveOptions);
const { isComputing, isComputingAny, hasComputedError } = useComputed(form, definition, props.resolveComputed);
const { register, unregister } = useCoverageWarnings(definition);
const pages = usePages(form, definition, resolvedLayout);

// top-level refs auto-unwrap in the template; the `pages` object's members would not
const isLastPage = pages.isLast;

/**
 * Async work that can still change values: a submit now would ship a stale
 * payload (in-flight computed, an options reconcile that may clear a value)
 * or race a multi-field write (populate).
 */
const isBusy = computed(() =>
  isPopulating.value || isComputingAny.value || isLoadingAnyOptions.value);

/** Unsaved changes — for leave guards and disabled save buttons. */
const isDirty = computed(() => isFormDirty(form));

const resolveField = (name: string): ValueField | undefined => {
  const field = fieldsByName.value[name];
  if (!field) {
    warn("form", `unknown field "${name}"`);
    return undefined;
  }
  return isValueField(field) ? field : undefined;
}

/** A section renders while its own condition holds AND it still has a visible field — an empty box never renders. */
const isSectionVisible = (section: ResolvedSection): boolean =>
  evaluate(section.visibleWhen, read) &&
  section.children.some(child => child.type === "field" && isVisible(child.path));

/** What the host's submit handler receives besides the values. */
const submitContext: SubmitContext = {
  form,
  setFieldErrors(errors) {
    for (const [name, messages] of Object.entries(errors)) {
      const path = name.split(".");
      if (!resolveFieldByNamePath(definition.fields, path)) {
        warn("form", `setFieldErrors: unknown field "${name}" — skipped`);
        continue;
      }
      writeFieldErrors(form, path, typeof messages === "string" ? [messages] : messages);
    }
  },
};

/**
 * Awaited by formisch's submit pipeline, so `isSubmitting` spans an async
 * handler. A rejection is reported, not rethrown — the form must survive a
 * failed server call.
 */
const submitForm = async (values: unknown) => {
  // a disabled button does not stop submit(form) or requestSubmit()
  if (isBusy.value) return;

  try {
    await props.onSubmit?.(values, submitContext);
  } catch (cause) {
    reportError("form", "submit handler failed", cause);
  }
}

// ---- focus management: a failed submit focuses its first invalid control ----

const formComponent = useTemplateRef<ComponentPublicInstance>("formEl");

onMounted(() => {
  const element = formComponent.value?.$el as HTMLFormElement | undefined;
  element?.addEventListener("submit", () => void focusInvalidAfterSubmit(element));
});

/** The native submit fires before validation settles — wait it out, then check. */
async function focusInvalidAfterSubmit(element: HTMLFormElement): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await nextTick();
    await Promise.resolve();
  }
  if (!form.isValid) focusFirstInvalid(element);
}

provide(FormContextKey, {
  form,
  definition,
  errorDisplay: props.errorDisplay ?? "always",
  text,
  controls: props.controls ?? {},
  pages,
  resolvedLayout,
  resolveField,
  isVisible,
  isSectionVisible,
  optionsFor,
  isLoadingOptions,
  isComputing,
  hasOptionsError,
  hasComputedError,
  register,
  unregister,
})

defineExpose({ form, isPopulating, isBusy, isDirty, hasPopulateError })
</script>

<template>
  <Form ref="formEl" :of="form" class="dynamic-form" @submit="submitForm">
    <!--
      populate writes many fields at once, so the whole form blocks. inert stops
      clicks, focus and tabbing in one attribute; `|| undefined` matters because
      SSR serialises `:inert="false"` as a present — and therefore active — attribute.
    -->
    <div
      class="busy-region"
      :class="{ 'is-busy': isPopulating }"
      :inert="isPopulating || undefined"
      :aria-busy="isPopulating"
    >
      <!-- Opening this slot replaces the fallback entirely — render <DynamicLayout /> yourself. -->
      <slot
        :form="form"
        :is-valid="form.isValid"
        :is-dirty="isDirty"
        :is-submitting="form.isSubmitting"
        :is-populating="isPopulating"
        :is-busy="isBusy"
        :is-computing="isComputing"
        :is-loading-options="isLoadingOptions"
        :has-options-error="hasOptionsError"
        :has-computed-error="hasComputedError"
        :has-populate-error="hasPopulateError"
        :pages="pages"
      >
        <DynamicLayout />

        <!-- deliberately NOT disabled while invalid: submitting surfaces the errors and
             focuses the first one — a dead button explains nothing -->
        <div class="actions">
          <!-- a wizard submits from its last step; DynamicLayout renders the step navigation -->
          <button v-if="!pages.enabled || isLastPage" type="submit" class="btn btn-primary" :disabled="form.isSubmitting || isBusy">
            {{ form.isSubmitting ? text.submitting : (submitLabel ?? text.submit) }}
          </button>
          <button type="button" class="btn" @click="reset(form)">{{ text.reset }}</button>
        </div>
      </slot>
    </div>

    <div v-if="isPopulating" class="busy-overlay" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true" />
      <span>{{ text.populating }}</span>
    </div>
  </Form>
</template>

<style scoped>
/* Only a positioning context on <form> — headless consumers put their own grid inside it. */
.dynamic-form {
  position: relative;
}

.busy-region.is-busy {
  opacity: .5;
  transition: opacity .15s;
}

.busy-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-auto-flow: column;
  gap: .6rem;
  place-content: center;
  align-items: center;
  pointer-events: none;
  font-size: .9rem;
  color: #374151;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: spin .6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.actions {
  display: flex;
  gap: .625rem;
  margin-top: 1rem;
}

.btn {
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  color: #374151;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, border-color .15s, opacity .15s;
}

.btn:hover:not(:disabled) {
  background: #f9fafb;
}

.btn-primary {
  color: #fff;
  background: #4f46e5;
  border-color: #4f46e5;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
