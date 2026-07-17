/**
 * Fills `{name}` placeholders in a template — the one string-interpolation
 * mechanism for every UI string (validation messages, the wizard's step
 * label). Unknown placeholders stay verbatim, so a typo'd template shows
 * itself instead of vanishing.
 */
export function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]));
}
