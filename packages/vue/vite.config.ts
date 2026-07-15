import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: () => "index.mjs",
      cssFileName: "style",
    },
    rollupOptions: {
      // everything a consumer provides stays external
      external: ["vue", "@formisch/vue", "valibot", "@formblatt/core"],
    },
  },
});
