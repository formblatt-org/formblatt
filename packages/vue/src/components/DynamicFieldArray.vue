<script setup lang="ts">
import { computed } from "vue";
import { FieldArray } from "@formisch/vue";
import { isValueField, resolveFieldByPath, walkValueFields, warn } from "@formblatt/core";
import type { ArrayField, PathKey, ValueField } from "@formblatt/core";
import { useFormContext } from "../form-context";
import { usePlacedFields } from "../internal/placement";
import { insertItem, moveItem, removeItem, swapItems } from "../form-store";
import FieldControl from "./FieldControl.vue";

/** One control rendered per row. `relPath` is row-relative; empty when the item IS the value. */
interface ItemField {
  relPath: string[];
  field: ValueField;
}

const props = defineProps<{ name: string }>()

const ctx = useFormContext();
const path = computed<PathKey[]>(() => [props.name]);

const arrayField = computed<ArrayField | undefined>(() => {
  const field = resolveFieldByPath(ctx.definition, [props.name]);

  if (!field) {
    warn("field-array", `unknown field "${props.name}"`);
    return undefined;
  }
  if (field.kind !== "array") {
    warn("field-array", `"${props.name}" is not an array field`);
    return undefined;
  }
  return field;
});

/** The value fields of one row — an object item's leaves at any depth, or the item itself when it is a value. Statically `hidden` fields are skipped. */
const itemFields = computed<ItemField[]>(() => {
  const item = arrayField.value?.item;
  if (!item) return [];

  if (item.kind === "object") {
    return walkValueFields(item.fields)
      .filter(entry => !entry.field.hidden)
      .map(entry => ({ relPath: entry.path, field: entry.field }));
  }
  return isValueField(item) && !item.hidden ? [{ relPath: [], field: item }] : [];
});

const itemPath = (index: number, child?: string): PathKey[] =>
  child == null ? [...path.value, index] : [...path.value, index, child];

/** Builds a row control's props once, rather than rebuilding its path for each of them. */
const controlProps = (index: number, entry: ItemField) => {
  const fieldPath = [...path.value, index, ...entry.relPath];

  return {
    of: ctx.form,
    path: fieldPath,
    field: entry.field,
    options: ctx.optionsFor(fieldPath),
    loading: ctx.isLoadingOptions(fieldPath) || ctx.isComputing(fieldPath),
  };
};

const insert = (initialInput?: unknown) => insertItem(ctx.form, path.value, initialInput);
const remove = (index: number) => removeItem(ctx.form, path.value, index);
const move = (from: number, to: number) => moveItem(ctx.form, path.value, from, to);
const swap = (at: number, and: number) => swapItems(ctx.form, path.value, at, and);

// formisch types FieldArray's `path` from the schema; ours is built at runtime (see form-store)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const arrayPath = computed(() => path.value as any);

usePlacedFields([props.name]);
</script>

<template>
  <FieldArray v-if="arrayField && ctx.isVisible(path)" :of="ctx.form" :path="arrayPath" v-slot="array">
    <!-- Opening this slot replaces the default rows entirely; build your own DOM from `items`. -->
    <slot
      :items="array.items"
      :errors="array.errors"
      :itemPath="itemPath"
      :insert="insert"
      :remove="remove"
      :move="move"
      :swap="swap"
    >
      <div class="dynamic-field-array">
        <div v-for="(id, index) in array.items" :key="id" class="array-item">
          <FieldControl
            v-for="entry in itemFields"
            :key="entry.relPath.join('.') || '@self'"
            v-bind="controlProps(index, entry)"
          />
          <button type="button" class="btn-row" @click="remove(index)">{{ ctx.text.value.removeRow }}</button>
        </div>

        <button type="button" class="btn-row" @click="insert()">{{ ctx.text.value.addRow }}</button>

        <ul v-if="array.errors" class="array-errors">
          <li v-for="error in array.errors" :key="error">{{ error }}</li>
        </ul>
      </div>
    </slot>
  </FieldArray>
</template>

<style scoped>
.dynamic-field-array {
  display: flex;
  flex-direction: column;
  gap: .875rem;
}

.array-item {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  padding: .75rem;
  border: 1px solid var(--fb-color-border-soft, #e5e7eb);
  border-radius: var(--fb-radius-lg, 10px);
}

.btn-row {
  align-self: flex-start;
  padding: .35rem .75rem;
  font: inherit;
  font-size: .85rem;
  color: var(--fb-color-label, #374151);
  background: var(--fb-color-surface, #fff);
  border: 1px solid var(--fb-color-border, #d1d5db);
  border-radius: var(--fb-radius, 8px);
  cursor: pointer;
}

.btn-row:hover {
  background: var(--fb-color-surface-hover, #f9fafb);
}

.array-errors {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--fb-color-error, #dc2626);
  font-size: .8rem;
}
</style>
