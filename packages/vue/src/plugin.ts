import type { App, Component, InjectionKey } from "vue";

/** The app-wide control registry {@link createFormblatt} provides. */
export const GlobalControlsKey: InjectionKey<Readonly<Record<string, Component>>> =
  Symbol("formblatt-global-controls");

export interface FormblattOptions {
  /**
   * Controls by registry key — a field's `control` name, plus the reserved
   * keys `"text"` (fields without a `control`) and `"multiple"` (multi-enums
   * without one). Every `DynamicForm` in the app renders from this registry;
   * its `controls` prop merges over it per form.
   */
  controls: Record<string, Component>;
}

/**
 * App-level control registration. The package is headless — it ships no
 * controls, so the app provides its own once:
 *
 * ```ts
 * app.use(createFormblatt({ controls: { text: TextInput, select: Dropdown, … } }))
 * ```
 *
 * A definition whose fields resolve to unregistered keys is rejected at
 * mount — `DynamicForm` renders its error state instead of a broken form.
 */
export function createFormblatt(options: FormblattOptions) {
  return {
    install(app: App) {
      app.provide(GlobalControlsKey, options.controls);
    },
  };
}
