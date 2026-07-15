/** Rounds to cents. Money must not carry floating-point noise into the payload. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formats an amount as USD, or an em dash while the value is still missing. */
export function money(value: unknown): string {
  return typeof value === "number" && !Number.isNaN(value) ? `$${value.toFixed(2)}` : "—";
}

/** First letter of a product name, for the placeholder thumbnails. */
export function initials(name: unknown): string {
  return typeof name === "string" && name ? name.trim().slice(0, 1).toUpperCase() : "?";
}
