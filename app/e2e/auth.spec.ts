import { test, expect } from "@playwright/test";
import { signup, uniqueEmail, PASSWORD } from "./helpers";

test.describe("auth", () => {
  test("signup lands in the mode launcher with all four skills", async ({ page }) => {
    await signup(page);
    await expect(page.getByRole("heading", { name: /what are you working on/i })).toBeVisible();
    for (const skill of ["Deep Research", "Academic Paper", "Paper Reviewer", "Full Pipeline"]) {
      await expect(page.getByRole("heading", { name: skill })).toBeVisible();
    }
  });

  test("mode search filters the launcher", async ({ page }) => {
    await signup(page);
    await page.getByPlaceholder(/search modes/i).fill("abstract");
    await expect(page.getByRole("button", { name: /Abstract/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Peer Review/ })).toHaveCount(0);
  });

  test("login round-trip and wrong-password rejection", async ({ page }) => {
    const email = uniqueEmail();
    await signup(page, email);

    // Log out via settings.
    await page.getByRole("link", { name: /settings/i }).click();
    await page.getByRole("button", { name: /log out/i }).click();
    await page.waitForURL("**/login");

    // Wrong password is rejected.
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder(/password/i).fill("wrong-password-1");
    await page.getByRole("button", { name: /^log in$/i }).click();
    await expect(page.getByText(/incorrect/i)).toBeVisible();

    // Correct password gets back in.
    await page.getByPlaceholder(/password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /^log in$/i }).click();
    await page.waitForURL("**/app");
  });

  test("signup rejects a short password", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /need an account/i }).click();
    await page.getByPlaceholder("Email").fill(uniqueEmail());
    const pw = page.getByPlaceholder(/password/i);
    await pw.fill("short");
    // The minLength attribute blocks submission client-side.
    await page.getByRole("button", { name: /^sign up$/i }).click();
    await expect(page).toHaveURL(/login/);
  });
});
