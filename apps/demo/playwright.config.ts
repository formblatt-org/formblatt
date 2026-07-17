import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // dev-mode Vite compiles each page on first visit — allow for it
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
