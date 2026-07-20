// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // the app's control kit styling — formblatt is headless and ships none
  css: ['~/assets/css/controls.css'],
  // workspace packages are consumed as raw TS / SFC source
  build: {
    transpile: ['@formblatt/core', '@formblatt/vue'],
  },
})
