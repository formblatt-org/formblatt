<script setup lang="ts">
import { computed } from "vue";
import { directFieldNames, findSection, warn } from "@formblatt/core";
import { useFormContext } from "../form-context";
import { usePlacedFields } from "../internal/placement";
import FieldControl from "./FieldControl.vue";
// <DynamicSection> resolves itself by filename inference — no self-import needed

const props = defineProps<{ id: string }>()

const ctx = useFormContext();

const section = computed(() => findSection(ctx.resolvedLayout.value, props.id));
if (!section.value) warn("section", `unknown section "${props.id}"`);

// only the fields placed directly here; nested sections register their own
usePlacedFields(section.value ? directFieldNames(section.value.children) : []);
</script>

<template>
  <details v-if="section && ctx.isSectionVisible(section)" :open="!section.collapsed">
    <summary>{{ section.title }}</summary>

    <template v-for="child in section.children" :key="child.type === 'field' ? child.name : child.id">
      <FieldControl
        v-if="child.type === 'field' && ctx.isVisible(child.path)"
        :of="ctx.form"
        :path="child.path"
        :field="child.field"
      />
      <DynamicSection v-else-if="child.type === 'section'" :id="child.id" />
    </template>
  </details>
</template>

<style scoped>
details {
  display: flex;
  flex-direction: column;
  gap: .875rem;
  padding: .25rem .875rem .95rem;
  border: 1px solid var(--fb-color-border-soft, #e5e7eb);
  border-radius: var(--fb-radius-lg, 10px);
  background: var(--fb-color-surface-soft, #fafafa);
}

summary {
  padding: .7rem .25rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
</style>
