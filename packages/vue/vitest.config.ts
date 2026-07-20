import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // a floor just under the measured level — a drop means untested new code
      // (re-baselined when the built-in controls moved out to the demo app)
      thresholds: { statements: 89, branches: 76, functions: 91, lines: 90 },
    },
  },
});
