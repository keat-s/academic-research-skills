import { test, expect } from "@playwright/test";
import { signup } from "./helpers";

test.describe("settings", () => {
  test("backend toggle, model picker, and BYOK key persistence", async ({ page }) => {
    await signup(page);
    await page.getByRole("link", { name: /settings/i }).click();

    // Three backend options render; Cloud is the default.
    await expect(page.getByRole("button", { name: /^cloud$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /in-browser/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /ollama/i })).toBeVisible();

    // BYOK key is saved to localStorage (and only there).
    await page.getByPlaceholder("sk-or-...").fill("sk-or-test-key-123");
    await expect(page.getByText(/^saved\.$/i)).toBeVisible();
    await page.reload();
    await expect(page.getByPlaceholder("sk-or-...")).toHaveValue("sk-or-test-key-123");
    await page.getByRole("button", { name: /remove key/i }).click();
    await expect(page.getByPlaceholder("sk-or-...")).toHaveValue("");
  });

  test("grounding default toggle persists", async ({ page }) => {
    await signup(page);
    await page.getByRole("link", { name: /settings/i }).click();
    const toggle = page.getByRole("checkbox");
    await toggle.check();
    await page.reload();
    await expect(page.getByRole("checkbox")).toBeChecked();
  });
});

test.describe("support", () => {
  test("shows funding channels without any paywall language", async ({ page }) => {
    await signup(page);
    await page.getByRole("link", { name: /support/i }).click();
    await expect(page.getByRole("heading", { name: /support ars studio/i })).toBeVisible();
    await expect(page.getByText(/no paid tiers or feature paywalls/i)).toBeVisible();
    // Donations render from the default config; BYOK section always present.
    await expect(page.getByRole("heading", { name: /donate/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /bring your own key/i })).toBeVisible();
    // Tip jar hidden when Stripe/payment link are unconfigured (e2e default).
    await expect(page.getByRole("heading", { name: /leave a tip/i })).toHaveCount(0);
  });
});
