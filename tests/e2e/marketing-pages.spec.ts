import { test, expect } from "./fixtures";

// Override authenticated storageState so all tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test("features page loads and has feature grid", async ({ page }) => {
  await page.goto("/features");
  await expect(page).toHaveTitle(/Features \| ClarityOS/);
  // Wave 1: assert ≥6 feature cards visible
  const headings = page.locator("h3");
  await expect(headings.first()).toBeVisible({ timeout: 10_000 });
});

test("pricing page shows three tiers and Schedule a Demo CTA", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page).toHaveTitle(/Pricing \| ClarityOS/);
  const ctaLinks = page.getByRole("link", { name: /Schedule a Demo/i });
  await expect(ctaLinks.first()).toBeVisible({ timeout: 10_000 });
  // Wave 1: assert count is >= 3 (one per tier) + 1 nav + maybe 1 banner
});

test("compare page renders competitor table", async ({ page }) => {
  await page.goto("/compare");
  await expect(page).toHaveTitle(/Compare \| ClarityOS|ClarityOS vs/);
  await expect(page.getByRole("columnheader", { name: /ClarityOS/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("columnheader", { name: /RevolutionEHR/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Barti/i })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /EyeCloudPro/i })).toBeVisible();
});

test("shared nav present on every marketing route", async ({ page }) => {
  for (const route of ["/", "/features", "/pricing", "/compare"]) {
    await page.goto(route);
    await expect(page.getByRole("link", { name: /^ClarityOS$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Features$/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Pricing$/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /^Compare$/ }).first()).toBeVisible();
  }
});

test("shared footer present on every marketing route", async ({ page }) => {
  for (const route of ["/", "/features", "/pricing", "/compare"]) {
    await page.goto(route);
    await expect(page.getByText(/© 2026 ClarityOS/)).toBeVisible();
  }
});

test("comparison footnote cites 'as of April 2026'", async ({ page }) => {
  await page.goto("/compare");
  await expect(page.getByText(/as of April 2026/i)).toBeVisible();
});
