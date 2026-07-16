<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { reset } from "@formisch/vue";
import type { FormDefinition } from "@formblatt/core";
import { DynamicForm, DynamicLayout, readDirtyInput, type SubmitContext } from "@formblatt/vue";

const settingsDefinition: FormDefinition = {
  id: "account-settings-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "displayName", kind: "string", control: "text", label: "Display name" },
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    {
      name: "bio", kind: "string", control: "textarea", label: "Bio", required: false,
      validations: [{ type: "maxLength", value: 160, message: "Keep it under 160 characters" }],
    },
    // `initial` is the DEFAULT for new accounts — the saved record hydrates over it
    {
      name: "language", kind: "enum", control: "select", label: "Language", initial: "en",
      options: [
        { label: "English", value: "en" },
        { label: "Deutsch", value: "de" },
        { label: "Srpski", value: "sr" },
      ],
    },
    {
      name: "notifications", kind: "enum", control: "radio", label: "Email notifications", initial: "all",
      options: [
        { label: "Everything", value: "all" },
        { label: "Mentions only", value: "mentions" },
        { label: "Nothing", value: "none" },
      ],
    },
    { name: "newsletter", kind: "boolean", control: "checkbox", label: "Send me the monthly newsletter", required: false },
  ],
};

/** Stands in for GET /me — the record an edit workflow hydrates the form with. */
const savedRecord = ref<Record<string, unknown>>({
  displayName: "Alek M.",
  email: "alek@example.com",
  bio: "Building forms out of JSON.",
  notifications: "mentions", // overrides the declared initial "all"
  newsletter: true,
});

/** initialData is read once at mount — bumping the key re-hydrates after a save. */
const formVersion = ref(0);

const lastPatch = ref<unknown>(null);

/**
 * Stands in for PATCH /me: `readDirtyInput` yields ONLY the fields that
 * differ from the hydrated record — the natural PATCH payload. The saved
 * record absorbs it and the remount makes the form pristine again.
 */
const save = async (_values: unknown, context: SubmitContext) => {
  const patch = readDirtyInput(context.form) as Record<string, unknown>;
  await new Promise(resolve => setTimeout(resolve, 600));

  savedRecord.value = { ...savedRecord.value, ...patch };
  lastPatch.value = patch;
  formVersion.value++;
}

/** `isDirty` is exposed by DynamicForm — the unsaved-changes signal for both guards. */
const settingsForm = useTemplateRef<InstanceType<typeof DynamicForm>>("settingsForm");

onBeforeRouteLeave(() => {
  if (settingsForm.value?.isDirty && !window.confirm("You have unsaved changes — leave anyway?")) {
    return false;
  }
});

// the route guard cannot catch a reload or tab close — that's the browser's dialog
const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (settingsForm.value?.isDirty) event.preventDefault();
};
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<template>
  <div class="settings-demo">
    <h1>Account settings</h1>
    <p class="tagline">
      An edit workflow: the form hydrates from a saved record via <code>initialData</code>,
      Save is enabled only while dirty and submits a PATCH of just the changed fields,
      and leaving with unsaved changes asks first.
    </p>

    <DynamicForm
      ref="settingsForm"
      :key="formVersion"
      :definition="settingsDefinition"
      :initial-data="savedRecord"
      @submit="save"
      v-slot="{ form, isDirty, isValid, isSubmitting }"
    >
      <DynamicLayout />

      <div class="actions">
        <button type="submit" class="btn btn-primary" :disabled="!isDirty || !isValid || isSubmitting">
          {{ isSubmitting ? "Saving…" : "Save changes" }}
        </button>
        <button type="button" class="btn" :disabled="!isDirty || isSubmitting" @click="reset(form)">
          Discard changes
        </button>
        <span v-if="isDirty" class="dirty-hint">Unsaved changes</span>
      </div>
    </DynamicForm>

    <div v-if="lastPatch" class="patched">
      Saved — the PATCH payload contained only what changed:
      <pre>{{ JSON.stringify(lastPatch, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.settings-demo {
  max-width: 460px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.settings-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.tagline code {
  padding: .05rem .3rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: .8em;
}

.actions {
  display: flex;
  align-items: center;
  gap: .625rem;
  margin-top: 1.25rem;
}

.dirty-hint {
  font-size: .8rem;
  color: #b45309;
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
  transition: background .15s, opacity .15s;
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

.patched {
  margin-top: 1.25rem;
  padding: .75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .875rem;
}

.patched pre {
  margin: .5rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}
</style>
