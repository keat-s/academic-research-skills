import { test, expect } from "@playwright/test";
import { signup } from "./helpers";

test.describe("chat", () => {
  test("entering a mode shows the welcome card and composer", async ({ page }) => {
    await signup(page);
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    await expect(page.getByText(/you're in/i)).toBeVisible();
    await expect(page.getByPlaceholder(/message quick brief/i)).toBeVisible();
    await expect(page.getByText(/ground citations/i)).toBeVisible();
  });

  test("sending without a shared key surfaces the BYOK error path", async ({ page }) => {
    await signup(page);
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    const box = page.getByPlaceholder(/message quick brief/i);
    await box.fill("What is peer review?");
    await box.press("Enter");
    // The e2e server runs without OPENROUTER_API_KEY → 402 with guidance.
    await expect(page.getByText(/add your own/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("Socratic modes are labelled as dialogues", async ({ page }) => {
    await signup(page);
    await page.getByPlaceholder(/search modes/i).fill("socratic");
    const card = page.getByRole("button", { name: /Socratic Research Guide/ });
    await expect(card).toContainText("dialogue");
    await card.click();
    await expect(page.getByText(/this is a guided dialogue/i)).toBeVisible();
  });
});
