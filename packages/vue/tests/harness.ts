import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { useForm } from "@formisch/vue";
import { buildFormSchema, buildInitialInput } from "@formblatt/core";
import type { FormDefinition } from "@formblatt/core";
import type { DynamicFormStore } from "../src/form-store";

/**
 * Mounts a real formisch store for `definition` and runs `setup` inside the
 * component, exactly as DynamicForm does.
 *
 * The composables install `watch`ers, so they need an owning component instance
 * and a flushed scheduler — hence a real mount rather than a bare effectScope.
 */
export function withForm<T>(
  definition: FormDefinition,
  setup: (form: DynamicFormStore) => T,
): { form: DynamicFormStore; result: T } {
  let captured!: { form: DynamicFormStore; result: T };

  const Harness = defineComponent({
    setup() {
      const form = useForm({
        schema: buildFormSchema(definition),
        initialInput: buildInitialInput(definition),
        validate: definition.validate,
        revalidate: definition.revalidate,
      }) as DynamicFormStore;

      captured = { form, result: setup(form) };
      return () => h("div");
    },
  });

  mount(Harness);
  return captured;
}

/** Lets watchers run and any settled promise chain flush. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await nextTick();
    await Promise.resolve();
  }
}

/** A resolver that never settles until `release` is called — for testing stale responses. */
export function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(resolve => { release = resolve; });
  return { promise, release };
}
