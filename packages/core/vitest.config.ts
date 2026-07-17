import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // a floor just under the measured level — a drop means untested new code
      thresholds: { statements: 94, branches: 92, functions: 90, lines: 94 },
    },
  },
});
