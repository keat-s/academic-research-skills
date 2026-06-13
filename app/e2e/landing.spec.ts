import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("renders hero and routes to login", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("academic work");
    await expect(page.getByText("Free forever")).toBeVisible();
    await page.getByRole("link", { name: /get started/i }).click();
    await page.waitForURL("**/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("shows the six feature cards", async ({ page }) => {
    await page.goto("/");
    for (const title of ["Deep research", "Paper writing", "Peer review", "Real citations"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });
});
