// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // workspace packages are consumed as raw TS / SFC source
  build: {
    transpile: ['@formblatt/core', '@formblatt/vue'],
  },
})
