import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // a floor just under the measured level — a drop means untested new code
      thresholds: { statements: 89, branches: 77, functions: 91, lines: 90 },
    },
  },
});
