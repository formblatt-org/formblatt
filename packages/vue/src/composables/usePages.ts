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
 * advancing. Visibility is live, and the current page is tracked BY ID — an
 * earlier page whose `visibleWhen` flips off shifts positions without
 * teleporting the user off their step. Only when the current page itself
 * disappears does the wizard move: to the nearest still-visible page before
 * it in layout order, else the first visible one.
 */
export function usePages(
  form: DynamicFormStore,
  definition: FormDefinition,
  resolvedLayout: ComputedRef<ResolvedNode[]>,
): PagesApi {
  const enabled = !!definition.layout?.some(node => node.type === "page");
  const read = createReader(form);

  /** Every page in layout order, visible or not — the reference order for repositioning. */
  const allPages = computed(() =>
    resolvedLayout.value.filter((node): node is ResolvedPage => node.type === "page"));

  const pages = computed(() =>
    allPages.value.filter(page => evaluate(page.visibleWhen, read)));

  const currentId = ref(pages.value[0]?.id);

  /** The nearest page before the vanished one (in layout order) that is still visible. */
  const nearestVisible = (visible: ResolvedPage[]): ResolvedPage | undefined => {
    const order = allPages.value.map(page => page.id);
    for (let at = order.indexOf(currentId.value ?? "") - 1; at >= 0; at--) {
      const candidate = visible.find(page => page.id === order[at]);
      if (candidate) return candidate;
    }
    return visible[0];
  };

  // sync flush: index/current must never dangle between a visibility change and
  // a pre-flush watcher run — templates read them in the same tick
  watch(pages, visible => {
    if (!visible.some(page => page.id === currentId.value)) {
      currentId.value = nearestVisible(visible)?.id;
    }
  }, { flush: "sync" });

  const index = computed(() => pages.value.findIndex(page => page.id === currentId.value));
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
    index,
    count: computed(() => pages.value.length),
    isFirst: computed(() => index.value <= 0),
    isLast: computed(() => index.value >= pages.value.length - 1),

    async next() {
      if (index.value >= pages.value.length - 1) return false;
      if (!(await validateCurrentPage())) return false;

      // re-derive the position: validation is async, and answers can flip page visibility
      const visible = pages.value;
      const target = visible[visible.findIndex(page => page.id === currentId.value) + 1];
      if (!target) return false;
      currentId.value = target.id;
      return true;
    },

    previous() {
      const target = pages.value[index.value - 1];
      if (target) currentId.value = target.id;
    },

    goTo(target: number) {
      if (target < 0 || target > index.value) return target === index.value;
      const page = pages.value[target];
      if (!page) return false;
      currentId.value = page.id;
      return true;
    },
  };
}
