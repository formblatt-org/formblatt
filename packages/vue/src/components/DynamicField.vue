<script setup lang="ts">
import { computed, onUnmounted, watch } from "vue";
import { isValueField, resolveFieldByPath, warn } from "@formblatt/core";
import type { PathKey, ValueField } from "@formblatt/core";
import { useFormContext } from "../form-context";
import FieldControl from "./FieldControl.vue";

const props = defineProps<{
  /** Addresses a top-level field by name. */
  name?: string;
  /** Addresses any field, including one inside an array item: `["lines", 0, "qty"]`. */
  path?: PathKey[];
}>()

const ctx = useFormContext();

if (!props.name && !props.path) {
  warn("field", "requires either `name` (top-level) or `path` (e.g. an array item's field)");
}

const fieldPath = computed<PathKey[]>(() => props.path ?? [props.name!]);

const field = computed<ValueField | undefined>(() => {
  if (!props.path) return ctx.resolveField(props.name!);

  const resolved = resolveFieldByPath(ctx.definition, props.path);
  if (!resolved) {
    warn("field", `unknown path ${JSON.stringify(props.path)}`);
    return undefined;
  }
  return isValueField(resolved) ? resolved : undefined;
});

// Placements count towards coverage by dotted name. A path with an index is
// inside an array item — covered by the DynamicFieldArray that places the array.
// Reactive: a changed `name`/`path` re-registers, keeping the tally truthful.
const trackedName = computed(() =>
  props.name ?? (props.path?.every(key => typeof key === "string") ? props.path.join(".") : undefined));

watch(trackedName, (name, previous) => {
  if (previous) ctx.unregister(previous);
  if (name) ctx.register(name);
}, { immediate: true });

onUnmounted(() => {
  if (trackedName.value) ctx.unregister(trackedName.value);
});
</script>

<template>
  <FieldControl v-if="field && ctx.isVisible(fieldPath)" :of="ctx.form" :path="fieldPath" :field="field" />
</template>
