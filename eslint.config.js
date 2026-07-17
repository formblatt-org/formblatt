import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/coverage/",
      "apps/demo/.nuxt/",
      "apps/demo/.output/",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // essential = correctness only. The stylistic layers are deliberately left
  // off: template formatting is enforced by .editorconfig, not autofix churn.
  ...vue.configs["flat/essential"],

  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // parse <script setup lang="ts"> blocks with the TS parser
  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },

  {
    rules: {
      // `any` is banned except at documented boundary casts, which carry an
      // inline disable — so every new one has to justify itself in review
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },

  // Nuxt file-based routes are single-word by design
  {
    files: ["apps/demo/app/pages/**/*.vue", "apps/demo/app/app.vue"],
    rules: { "vue/multi-word-component-names": "off" },
  },

  // tests feed deliberately invalid inputs through `any`
  {
    files: ["packages/*/tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
