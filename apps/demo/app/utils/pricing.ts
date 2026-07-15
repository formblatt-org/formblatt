import { round2 } from "./format";

/** One row of the cart, as the form stores it while the user is still editing. */
export interface CartLine {
  qty?: number;
  price?: number;
}

/**
 * Sums the cart lines; a row mid-edit can hold a missing qty or price, which
 * counts as zero rather than poisoning the total with `NaN`. Stands in for
 * the pricing service a real checkout would reach through a `ComputedResolver`.
 */
export function subtotalOf(lines: readonly CartLine[]): number {
  const total = lines.reduce(
    (sum, line) => sum + (Number(line?.qty) || 0) * (Number(line?.price) || 0),
    0,
  );
  return round2(total);
}

/** Free over $100, flat fee otherwise, nothing to ship on an empty cart. */
export function shippingFor(subtotal: number): number {
  if (subtotal === 0) return 0;
  return subtotal >= 100 ? 0 : 9.95;
}

/** Flat sales tax on the subtotal. */
export function taxFor(subtotal: number): number {
  return round2(subtotal * 0.0825);
}
