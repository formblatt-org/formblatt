<script setup lang="ts">
import { computed, onUnmounted } from "vue";
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
const trackedName = props.name
  ?? (props.path?.every(key => typeof key === "string") ? props.path.join(".") : undefined);
if (trackedName) {
  ctx.register(trackedName);
  onUnmounted(() => ctx.unregister(trackedName));
}
</script>

<template>
  <FieldControl
    v-if="field && ctx.isVisible(fieldPath)"
    :of="ctx.form"
    :path="fieldPath"
    :field="field"
    :options="ctx.optionsFor(fieldPath)"
    :loading="ctx.isLoadingOptions(fieldPath) || ctx.isComputing(fieldPath)"
  />
</template>
