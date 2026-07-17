import { expect, test, type Page } from "@playwright/test";

/**
 * One smoke test per demo page: it renders its form (or the landing grid),
 * with no page errors and no console errors. Every page is a real formblatt
 * scenario, so this catches an engine regression that unit mounts miss —
 * the full Nuxt + formisch + valibot stack has to boot for each one.
 */

/** Every route and what proves it rendered. */
const PAGES: { path: string; proof: string }[] = [
  { path: "/", proof: ".card" },
  { path: "/account", proof: "form" },
  { path: "/product", proof: "form" },
  { path: "/checkout", proof: "form" },
  { path: "/cart", proof: "form" },
  { path: "/todos", proof: "form" },
  { path: "/careers", proof: "form" },
  { path: "/signup", proof: "form" },
  { path: "/settings", proof: "form" },
  { path: "/survey", proof: "form" },
  { path: "/contact", proof: "form" },
  { path: "/booking", proof: "form" },
  { path: "/transfer", proof: "form" },
  { path: "/donate", proof: "form" },
  { path: "/support", proof: "form" },
  { path: "/event", proof: "form" },
  { path: "/flights", proof: "form" },
  { path: "/playground", proof: ".editor" },
];

/** Console/page errors that are real failures — dev-server noise is not. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("favicon")) return; // the demo ships none
    errors.push(`console: ${text}`);
  });
  return errors;
}

for (const { path, proof } of PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors = collectErrors(page);

    await page.goto(path);
    await expect(page.locator(proof).first()).toBeVisible();

    expect(errors).toEqual([]);
  });
}
