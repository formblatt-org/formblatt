/** `import.meta.dev` under Nuxt, `import.meta.env.DEV` under plain Vite. */
export function isDevelopment(): boolean {
  const meta = import.meta as unknown as { dev?: boolean; env?: { DEV?: boolean } };
  return !!(meta.dev ?? meta.env?.DEV);
}
