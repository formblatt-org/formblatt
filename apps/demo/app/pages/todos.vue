<script setup lang="ts">
import { ref } from "vue";
import type { PathKey } from "@formblatt/core";
import {
  createTypedForm,
  defineFormDefinition,
  readInput,
  type DynamicFormStore,
} from "@formblatt/vue";

/** The whole list is ONE array field — rows are added, edited and reordered through the store. */
const todosDefinition = defineFormDefinition({
  id: "todos-v1",
  validate: "initial",
  revalidate: "input",
  fields: [
    {
      name: "todos", kind: "array", label: "Todos",
      item: {
        name: "todo", kind: "object",
        fields: [
          { name: "done", kind: "boolean", control: "checkbox", required: false },
          {
            name: "title", kind: "string", control: "text",
            validations: [
              { type: "minLength", value: 3, message: "A todo needs at least 3 characters" },
              { type: "maxLength", value: 120, message: "Keep it under 120 characters" },
            ],
          },
        ],
      },
      initial: [
        { done: true, title: "Read the formblatt readme" },
        { done: false, title: "Sketch the first form definition" },
        { done: false, title: "Wire up the submit handler" },
      ],
    },
  ],
});

// Typed against todosDefinition: `name` / `path` autocomplete, and the submit
// payload below is inferred — no `unknown` to cast.
const { DynamicForm, DynamicField, DynamicFieldArray } = createTypedForm(todosDefinition);

/** Reads a live value for display — the row text style follows `done` reactively. */
const valueAt = (form: DynamicFormStore, path: PathKey[]) => readInput(form, path);

const openCount = (form: DynamicFormStore) =>
  ((valueAt(form, ["todos"]) ?? []) as { done?: boolean }[]).filter(todo => !todo.done).length;

/** The new-todo draft lives OUTSIDE the form — it only becomes form data on add. */
const draft = ref("");

function addTodo(insert: (initialInput?: unknown) => void) {
  const title = draft.value.trim();
  if (!title) return;

  insert({ done: false, title });
  draft.value = "";
}

const saved = ref<unknown>(null);

const saveList = (values: { todos: { done?: boolean; title: string }[] }) => {
  saved.value = values;
}
</script>

<template>
  <div class="todos-demo">
    <h1>Todos</h1>
    <p class="tagline">
      A field array as a todo list: add, edit inline, toggle, reorder and remove rows —
      every row validated by one shared item schema.
    </p>

    <DynamicForm :definition="todosDefinition" @submit="saveList" v-slot="{ form, isValid, isDirty, isSubmitting }">
      <DynamicFieldArray name="todos" v-slot="{ items, itemPath, insert, remove, move }">
        <!-- Enter adds a row; prevent the default, which would submit the form. -->
        <div class="draft">
          <input
            v-model="draft"
            type="text"
            placeholder="What needs doing?"
            @keydown.enter.prevent="addTodo(insert)"
          />
          <button type="button" class="btn" :disabled="!draft.trim()" @click="addTodo(insert)">Add</button>
        </div>

        <p v-if="!items.length" class="empty">Nothing to do — add your first todo above.</p>

        <ul class="list">
          <li
            v-for="(id, index) in items"
            :key="id"
            class="row"
            :class="{ 'is-done': !!valueAt(form, itemPath(index, 'done')) }"
          >
            <DynamicField :path="itemPath(index, 'done')" class="check" />
            <DynamicField :path="itemPath(index, 'title')" class="title" />
            <div class="row-actions">
              <button type="button" class="icon" title="Move up" :disabled="index === 0"
                      @click="move(index, index - 1)">↑</button>
              <button type="button" class="icon" title="Move down" :disabled="index === items.length - 1"
                      @click="move(index, index + 1)">↓</button>
              <button type="button" class="icon icon-danger" title="Remove"
                      @click="remove(index)">✕</button>
            </div>
          </li>
        </ul>

        <footer class="list-footer">
          <span class="count">{{ openCount(form) }} open</span>
          <button type="submit" class="btn btn-primary" :disabled="isSubmitting || !isValid || !isDirty">
            {{ isSubmitting ? "Saving…" : "Save list" }}
          </button>
        </footer>
      </DynamicFieldArray>
    </DynamicForm>

    <div v-if="saved" class="saved">
      Saved — payload below.
      <pre>{{ JSON.stringify(saved, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.todos-demo {
  max-width: 520px;
  margin: 2.5rem auto;
  padding: 1.75rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 10px 30px rgba(0, 0, 0, .05);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
}

.todos-demo h1 {
  margin: 0 0 .35rem;
  font-size: 1.3rem;
  font-weight: 650;
}

.tagline {
  margin: 0 0 1.25rem;
  font-size: .85rem;
  color: #6b7280;
}

.draft {
  display: flex;
  gap: .5rem;
  margin-bottom: 1rem;
}

.draft input {
  flex: 1;
  padding: .5rem .625rem;
  font: inherit;
  font-size: .9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.draft input:focus {
  outline: none;
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, .15);
}

.empty {
  color: #9ca3af;
  font-size: .9rem;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: .625rem;
  padding: .55rem 0;
  border-bottom: 1px solid #f3f4f6;
}

.check {
  padding-top: .55rem;
}

.check :deep(input) {
  margin: 0;
}

.title :deep(input) {
  border-color: transparent;
  background: transparent;
}

.title :deep(input:hover) {
  border-color: #e5e7eb;
}

.title :deep(input:focus) {
  background: #fff;
}

.is-done .title :deep(input) {
  text-decoration: line-through;
  color: #9ca3af;
}

.row-actions {
  display: flex;
  gap: .25rem;
  padding-top: .3rem;
}

.icon {
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: .8rem;
  line-height: 1;
  color: #9ca3af;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
  transition: color .15s, border-color .15s;
}

.icon:hover:not(:disabled) {
  color: #374151;
  border-color: #d1d5db;
}

.icon-danger:hover:not(:disabled) {
  color: #dc2626;
  border-color: #fca5a5;
}

.icon:disabled {
  opacity: .35;
  cursor: not-allowed;
}

.list-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}

.count {
  font-size: .85rem;
  color: #6b7280;
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

.saved {
  margin-top: 1.25rem;
  padding: .75rem 1rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  color: #065f46;
  font-size: .875rem;
}

.saved pre {
  margin: .5rem 0 0;
  padding: .6rem;
  background: #f0fdf9;
  border-radius: 6px;
  font-size: .75rem;
  max-height: 220px;
  overflow: auto;
}
</style>
