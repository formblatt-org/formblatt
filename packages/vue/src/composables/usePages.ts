import { computed, ref, watch, type ComputedRef } from "vue";
import { collectFieldNames, evaluate } from "@formblatt/core";
import type { FormDefinition, ResolvedNode } from "@formblatt/core";
import {
  createReader,
  readFieldErrors,
  runValidation,
  type DynamicFormStore,
} from "../form-store";

/** A resolved `page` layout node — one wizard step. */
export type ResolvedPage = Extract<ResolvedNode, { type: "page" }>;

/**
 * The wizard state a paged layout drives — provided through the form context,
 * so custom layouts can build their own step UI over the same gating.
 */
export interface PagesApi {
  /** Whether the layout declares pages at all — static per definition. */
  enabled: boolean;
  /** The currently VISIBLE pages, in step order (`visibleWhen` filters). */
  pages: ComputedRef<ResolvedPage[]>;
  current: ComputedRef<ResolvedPage | undefined>;
  /** Zero-based step index into {@link pages}. */
  index: ComputedRef<number>;
  count: ComputedRef<number>;
  isFirst: ComputedRef<boolean>;
  isLast: ComputedRef<boolean>;
  /**
   * Validates the whole form, advances only when the CURRENT page's fields
   * carry no errors, and resolves with whether it advanced.
   */
  next(): Promise<boolean>;
  previous(): void;
  /** Jumps to an already-visited step; forward jumps must go through {@link next}. */
  goTo(index: number): boolean;
}

/**
 * Drives a paged layout: which step is current, and the validation gate for
 * advancing. Visibility is live — a page whose `visibleWhen` flips off leaves
 * the step order, and the current index is clamped if the list shrinks
 * beneath it.
 */
export function usePages(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolvedLayout: ComputedRef<ResolvedNode[]>,
): PagesApi {
  const enabled = !!definition.layout?.some(node => node.type === "page");
  const read = createReader(form);

  const pages = computed(() =>
    resolvedLayout.value
      .filter((node): node is ResolvedPage => node.type === "page")
      .filter(page => evaluate(page.visibleWhen, read)));

  const index = ref(0);
  watch(pages, list => {
    if (index.value >= list.length) index.value = Math.max(0, list.length - 1);
  });

  const current = computed(() => pages.value[index.value]);

  /** Runs a full pass, then reads back only the CURRENT page's errors. */
  async function validateCurrentPage(): Promise<boolean> {
    const page = current.value;
    if (!page) return true;

    await runValidation(form);
    return collectFieldNames([page]).every(name => !readFieldErrors(form, name.split(".")));
  }

  return {
    enabled,
    pages,
    current,
    index: computed(() => index.value),
    count: computed(() => pages.value.length),
    isFirst: computed(() => index.value === 0),
    isLast: computed(() => index.value >= pages.value.length - 1),

    async next() {
      if (index.value >= pages.value.length - 1) return false;
      if (!(await validateCurrentPage())) return false;
      index.value++;
      return true;
    },

    previous() {
      if (index.value > 0) index.value--;
    },

    goTo(target: number) {
      if (target < 0 || target > index.value) return target === index.value;
      index.value = target;
      return true;
    },
  };
}
