<script setup lang="ts">
import { computed, nextTick, useTemplateRef } from "vue";
import { collectFieldNames, directFieldNames, interpolate } from "@formblatt/core";
import type { ResolvedNode } from "@formblatt/core";
import { useFormContext } from "../form-context";
import { focusFirstInvalid } from "../internal/focus";
import { usePlacedFields } from "../internal/placement";
import FieldControl from "./FieldControl.vue";
import DynamicSection from "./DynamicSection.vue";

const props = defineProps<{
  /** Field names and section ids to leave out — for when you hand-place some nodes yourself. */
  exclude?: string[];
}>()

const ctx = useFormContext();
const { pages } = ctx;
const currentPage = pages.current;

const rootElement = useTemplateRef<HTMLElement>("rootEl");

/** In paged mode only the current step's children render; flat mode renders everything. */
const nodes = computed<ResolvedNode[]>(() => {
  const excluded = new Set(props.exclude ?? []);
  const source = pages.enabled ? (currentPage.value?.children ?? []) : ctx.resolvedLayout.value;
  return source.filter(node => !excluded.has(node.type === "field" ? node.name : node.id));
});

// Coverage: bare fields placed here register directly; mounted sections register
// their own children. Fields on the OTHER pages never mount, but the wizard does
// place them — register them wholesale so they don't report as forgotten.
if (pages.enabled) {
  const others = ctx.resolvedLayout.value
    .filter((node): node is Extract<ResolvedNode, { type: "page" }> => node.type === "page")
    .filter(page => page !== currentPage.value);
  usePlacedFields([
    ...directFieldNames(currentPage.value?.children ?? []),
    ...others.flatMap(page => collectFieldNames([page])),
  ]);
} else {
  usePlacedFields(directFieldNames(nodes.value));
}

const stepText = computed(() =>
  interpolate(ctx.text.value.stepLabel, { current: pages.index.value + 1, total: pages.count.value }));

/** A blocked step keeps the user in place — point them at the first problem. */
const onNext = async () => {
  const advanced = await pages.next();
  if (advanced) return;
  await nextTick(); // the aria-invalid attributes the selector reads render after the validation state
  focusFirstInvalid(rootElement.value);
};
</script>

<template>
  <div ref="rootEl" class="dynamic-layout">
    <header v-if="pages.enabled" class="page-header">
      <span class="step-indicator">{{ stepText }}</span>
      <h3 v-if="currentPage?.title" class="page-title">{{ currentPage.title }}</h3>
    </header>

    <template v-for="node in nodes" :key="node.type === 'field' ? node.name : node.id">
      <FieldControl
        v-if="node.type === 'field' && ctx.isVisible(node.path)"
        :of="ctx.form"
        :path="node.path"
        :field="node.field"
      />
      <DynamicSection v-else-if="node.type === 'section'" :id="node.id" />
    </template>

    <div v-if="pages.enabled" class="page-nav">
      <button v-if="!pages.isFirst.value" type="button" class="btn" @click="pages.previous()">
        {{ ctx.text.value.back }}
      </button>
      <button v-if="!pages.isLast.value" type="button" class="btn btn-primary" @click="onNext">
        {{ ctx.text.value.next }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dynamic-layout {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: .15rem;
}

.step-indicator {
  font-size: .8rem;
  color: var(--fb-color-muted, #6b7280);
}

.page-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--fb-color-text, #1f2937);
}

.page-nav {
  display: flex;
  gap: .625rem;
  margin-top: .25rem;
}

.btn {
  padding: .55rem 1.1rem;
  font: inherit;
  font-size: .9rem;
  font-weight: 550;
  color: var(--fb-color-label, #374151);
  background: var(--fb-color-surface, #fff);
  border: 1px solid var(--fb-color-border, #d1d5db);
  border-radius: var(--fb-radius, 8px);
  cursor: pointer;
  transition: background .15s, border-color .15s;
}

.btn:hover {
  background: var(--fb-color-surface-hover, #f9fafb);
}

.btn-primary {
  color: var(--fb-color-primary-contrast, #fff);
  background: var(--fb-color-primary, #4f46e5);
  border-color: var(--fb-color-primary, #4f46e5);
}

.btn-primary:hover {
  background: var(--fb-color-primary-hover, #4338ca);
}
</style>
