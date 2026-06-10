import type { Page } from "@playwright/test";

let counter = 0;

/** Unique email per test run to avoid collisions in the shared e2e DB. */
export function uniqueEmail(): string {
  counter += 1;
  return `e2e-${Date.now()}-${counter}@test.local`;
}

export const PASSWORD = "e2e-password-123";

/** Sign up a fresh account and land in the studio. */
export async function signup(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto("/login");
  await page.getByRole("button", { name: /need an account/i }).click();
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^sign up$/i }).click();
  await page.waitForURL("**/app");
  return email;
}
