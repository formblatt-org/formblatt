import { createFormblatt } from "@formblatt/vue";
import { DEMO_CONTROLS } from "../utils/demo-controls";

/** Registers the app's control kit once — every DynamicForm renders from it. */
export default defineNuxtPlugin(nuxtApp => {
  nuxtApp.vueApp.use(createFormblatt({ controls: DEMO_CONTROLS }));
});
