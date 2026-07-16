<script setup lang="ts">
import { computed, ref } from "vue";
import * as v from "valibot";
import {
  FormDefinitionSchema,
  lintDefinition,
  migrateDefinition,
  type FormDefinition,
  type LintIssue,
} from "@formblatt/core";
import { DynamicForm } from "@formblatt/vue";

/** A valid definition to start from — visibility affect, enum options, validations. */
const SAMPLE: FormDefinition = {
  id: "newsletter-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    { name: "email", kind: "string", control: "email", label: "Email", validations: [{ type: "email" }] },
    {
      name: "frequency", kind: "enum", control: "radio", label: "How often?",
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
      ],
    },
    {
      name: "digestDay", kind: "enum", control: "select", label: "Weekly digest day",
      options: [
        { label: "Monday", value: "mon" },
        { label: "Friday", value: "fri" },
      ],
    },
  ],
  affects: [
    { effect: "show", when: { path: ["frequency"], op: "eq", value: "weekly" }, targets: [["digestDay"]] },
  ],
};

/** The same definition sabotaged: a dangling affect target, a rule type nothing implements, a layout name typo. */
const BROKEN: unknown = {
  ...SAMPLE,
  id: "newsletter-broken-v1",
  fields: (SAMPLE.fields as unknown[]).map(field =>
    (field as { name: string }).name === "email"
      ? { ...(field as object), validations: [{ type: "emial" }] }
      : field),
  affects: [
    { effect: "show", when: { path: ["frequency"], op: "eq", value: "weekly" }, targets: [["digestDya"]] },
  ],
  layout: [{ type: "field", name: "emails" }],
};

/** From a future package version — the migration chain refuses to run downhill. */
const FUTURE: unknown = {
  schemaVersion: 2,
  id: "from-the-future-v1",
  fields: [{ name: "email", kind: "string" }],
};

const source = ref(JSON.stringify(SAMPLE, null, 2));

const load = (definition: unknown) => {
  source.value = JSON.stringify(definition, null, 2);
};

interface Diagnosis {
  /** A problem that stops analysis entirely: unparseable JSON or an unmigratable version. */
  fatal: string | null;
  issues: LintIssue[];
  definition: FormDefinition | null;
}

/**
 * The same pipeline a backend runs before serving a definition:
 * parse → migrate → structural shape check → referential lint.
 */
const diagnosis = computed<Diagnosis>(() => {
  let raw: unknown;
  try {
    raw = JSON.parse(source.value);
  } catch (cause) {
    return { fatal: `Not valid JSON — ${(cause as Error).message}`, issues: [], definition: null };
  }

  let migrated: FormDefinition;
  try {
    migrated = migrateDefinition(raw as FormDefinition);
  } catch (cause) {
    return { fatal: (cause as Error).message, issues: [], definition: null };
  }

  const shape = v.safeParse(FormDefinitionSchema, migrated);
  if (!shape.success) {
    return {
      fatal: null,
      issues: shape.issues.map(issue => ({
        severity: "error" as const,
        location: v.getDotPath(issue) ?? "(root)",
        message: issue.message,
      })),
      definition: null,
    };
  }

  // the referential lint expects a structurally valid definition — never run it earlier
  return { fatal: null, issues: lintDefinition(migrated), definition: migrated };
});

const errorCount = computed(() => diagnosis.value.issues.filter(issue => issue.severity === "error").length);
const isValid = computed(() => !diagnosis.value.fatal && !errorCount.value && !!diagnosis.value.definition);

/** What the preview renders — only ever a definition that passed, so the form cannot crash. */
const preview = ref<FormDefinition>(SAMPLE);
const previewVersion = ref(0);

const apply = () => {
  if (!isValid.value || !diagnosis.value.definition) return;
  preview.value = diagnosis.value.definition;
  previewVersion.value++;
  submitted.value = null;
};

const submitted = ref<unknown>(null);

const logSubmission = (values: unknown) => {
  submitted.value = values;
}
</script>

<template>
  <div class="playground">
    <header class="intro">
      <h1>Definition playground</h1>
      <p>
        Edit the JSON on the left — it runs the pipeline a backend would
        (<code>migrateDefinition</code> → shape check → <code>lintDefinition</code>) on every
        keystroke. Apply a valid definition to render it on the right.
      </p>
      <div class="samples">
        <span>Load:</span>
        <button type="button" class="chip" @click="load(SAMPLE)">valid example</button>
        <button type="button" class="chip" @click="load(BROKEN)">broken example</button>
        <button type="button" class="chip" @click="load(FUTURE)">newer schemaVersion</button>
      </div>
    </header>

    <div class="columns">
      <section class="editor-pane">
        <textarea v-model="source" class="editor" spellcheck="false" aria-label="Form definition JSON" />

        <div class="diagnostics">
          <p v-if="diagnosis.fatal" class="issue is-error">{{ diagnosis.fatal }}</p>

          <template v-else-if="diagnosis.issues.length">
            <p
              v-for="issue in diagnosis.issues"
              :key="issue.location + issue.message"
              class="issue"
              :class="issue.severity === 'error' ? 'is-error' : 'is-warning'"
            >
              <strong>{{ issue.severity }}</strong>
              <code>{{ issue.location }}</code>
              {{ issue.message }}
            </p>
          </template>

          <p v-else class="issue is-ok">Definition is valid.</p>
        </div>

        <button type="button" class="btn btn-primary" :disabled="!isValid" @click="apply">
          Apply to preview
        </button>
      </section>

      <section class="preview-pane">
        <h2>Preview</h2>
        <!-- no resolvers are passed here: definitions using populate / optionsSource / source-mode
             computed still render, with a console warning pointing at the missing resolver -->
        <DynamicForm
          :key="previewVersion"
          :definition="preview"
          @submit="logSubmission"
        />

        <div v-if="submitted" class="submitted">
          Submitted payload:
          <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.playground {
  max-width: 1020px;
  margin: 2.5rem auto;
  padding: 0 1.5rem 3rem;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.intro h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.intro p {
  margin: 0 0 .75rem;
  font-size: .85rem;
  color: #6b7280;
  max-width: 640px;
}

.intro code {
  padding: .05rem .3rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: .8em;
}

.samples {
  display: flex;
  align-items: center;
  gap: .5rem;
  margin-bottom: 1.25rem;
  font-size: .82rem;
  color: #6b7280;
}

.chip {
  padding: .25rem .7rem;
  font: inherit;
  font-size: .78rem;
  font-weight: 550;
  color: #4f46e5;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  cursor: pointer;
}

.chip:hover {
  background: #e0e7ff;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 2rem;
  align-items: start;
}

.editor-pane {
  display: flex;
  flex-direction: column;
  gap: .75rem;
}

.editor {
  width: 100%;
  box-sizing: border-box;
  min-height: 420px;
  padding: .875rem;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: .8rem;
  line-height: 1.5;
  color: #1f2937;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  resize: vertical;
}

.editor:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, .15);
}

.diagnostics {
  display: flex;
  flex-direction: column;
  gap: .35rem;
}

.issue {
  margin: 0;
  padding: .45rem .625rem;
  font-size: .8rem;
  border-radius: 6px;
}

.issue strong {
  margin-right: .4rem;
  text-transform: uppercase;
  font-size: .68rem;
  letter-spacing: .04em;
}

.issue code {
  margin-right: .4rem;
  font-size: .95em;
}

.is-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.is-warning {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.is-ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.btn {
  align-self: flex-start;
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s, opacity .15s;
}

.btn-primary {
  color: #fff;
  background: #4f46e5;
  border: 1px solid #4f46e5;
}

.btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

.preview-pane {
  padding: 1.5rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}

.preview-pane h2 {
  margin: 0 0 1rem;
  font-size: .8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: #6b7280;
}

.submitted {
  margin-top: 1.25rem;
  padding: .75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .875rem;
}

.submitted pre {
  margin: .5rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  overflow: auto;
}

@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
