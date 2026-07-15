<script setup lang="ts">
import { computed } from "vue";
import { directFieldNames } from "@formblatt/core";
import { useFormContext } from "../form-context";
import { usePlacedFields } from "../internal/placement";
import FieldControl from "./FieldControl.vue";
import DynamicSection from "./DynamicSection.vue";

const props = defineProps<{
  /** Field names and section ids to leave out — for when you hand-place some nodes yourself. */
  exclude?: string[];
}>()

const ctx = useFormContext();

const nodes = computed(() => {
  const excluded = new Set(props.exclude ?? []);
  return ctx.resolvedLayout.value.filter(node =>
    !excluded.has(node.type === "section" ? node.id : node.name));
});

// only the bare fields placed here; sections register their own children
usePlacedFields(directFieldNames(nodes.value));
</script>

<template>
  <div class="dynamic-layout">
    <template v-for="node in nodes" :key="node.type === 'section' ? node.id : node.name">
      <FieldControl
        v-if="node.type === 'field' && ctx.isVisible(node.path)"
        :of="ctx.form"
        :path="node.path"
        :field="node.field"
        :options="ctx.optionsFor(node.path)"
        :loading="ctx.isLoadingOptions(node.path) || ctx.isComputing(node.path)"
      />
      <DynamicSection v-else-if="node.type === 'section'" :id="node.id" />
    </template>
  </div>
</template>

<style scoped>
.dynamic-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
