import { onUnmounted } from "vue";
import { useFormContext } from "../form-context";

/**
 * Reports the fields a component places, for the form's coverage warnings.
 * Call it with whatever the component *decides* to place, before any
 * visibility `v-if` — a hidden field is still a placed field.
 */
export function usePlacedFields(names: readonly string[]): void {
  const ctx = useFormContext();

  names.forEach(ctx.register);
  onUnmounted(() => names.forEach(ctx.unregister));
}
