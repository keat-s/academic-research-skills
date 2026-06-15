/**
 * Studio interaction specs — no live LLM key required.
 *
 * Covers:
 *   - edit-and-resend: after a message is in the thread, the Edit button opens
 *     an inline textarea and "Save and resend" is wired up.
 *   - upload/attach: the paperclip button is present and activates a hidden
 *     file input (we verify the input accepts the correct MIME types without
 *     actually uploading, since the e2e server has no OPENROUTER_API_KEY).
 *
 * Deferred (require live infra or are already covered):
 *   - quota-exhausted → 429/402 path: the e2e server boots with no
 *     ARS_FREE_DAILY_MESSAGES=0 override and the shared DB accumulates state
 *     across tests, so exhausting the real quota would pollute other specs.
 *     The BYOK/no-key 402 path is already exercised in chat.spec.ts
 *     ("sending without a shared key surfaces the BYOK error path"), which
 *     also covers the "Add your own key" UI branch triggered by quota/limit
 *     errors. A dedicated quota-exhausted spec needs either a per-test DB
 *     seeded with consumed messages, or a stub server — defer to a follow-up.
 *   - streamed LLM reply assertions: need a live OpenRouter key or a
 *     stub SSE server; deferred to avoid flaky CI.
 *   - truncate-context: depends on a multi-turn history with a live LLM;
 *     deferred.
 */

import { test, expect } from "@playwright/test";
import path from "node:path";
import { signup } from "./helpers";

test.describe("edit-and-resend", () => {
  test("edit button opens inline editor with Save and resend", async ({ page }) => {
    await signup(page);

    // Enter a mode so the chat composer is visible.
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    await expect(page.getByText(/you're in/i)).toBeVisible();

    const box = page.getByPlaceholder(/message quick brief/i);
    await box.fill("What is peer review?");
    await box.press("Enter");

    // The server has no OPENROUTER_API_KEY → the message is sent and the UI
    // shows the user bubble plus an error. Wait for the user bubble.
    const userBubble = page.locator("p.whitespace-pre-wrap", { hasText: "What is peer review?" });
    await expect(userBubble).toBeVisible({ timeout: 10_000 });

    // Hover the user bubble's parent group to reveal the action row.
    await userBubble.hover();

    // The Edit (pencil) button appears.
    const editBtn = page.getByRole("button", { name: /edit/i });
    await expect(editBtn).toBeVisible({ timeout: 5_000 });
    await editBtn.click();

    // An inline textarea should appear, pre-filled with the original message.
    const editArea = page.locator("textarea").filter({ hasText: "What is peer review?" });
    await expect(editArea).toBeVisible();
    await expect(editArea).toHaveValue("What is peer review?");

    // "Save and resend" button is wired up.
    await expect(page.getByRole("button", { name: /save and resend/i })).toBeVisible();

    // Cancel restores the original bubble.
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(userBubble).toBeVisible();
    await expect(page.locator("textarea").filter({ hasText: "What is peer review?" })).toHaveCount(0);
  });
});

test.describe("attach / upload", () => {
  test("paperclip button activates a hidden file input with correct accept types", async ({ page }) => {
    await signup(page);
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    await expect(page.getByText(/you're in/i)).toBeVisible();

    // The paperclip button is visible in the composer.
    const clipBtn = page.getByRole("button", { name: /attach a document/i });
    await expect(clipBtn).toBeVisible();

    // The underlying hidden file input has the correct accept attribute.
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute(
      "accept",
      ".pdf,.txt,.md,.tex,.csv,.json,.bib,text/*,application/pdf"
    );
    await expect(fileInput).toHaveAttribute("multiple", "");
  });

  test("attaching a text file shows a chip in the composer", async ({ page }) => {
    await signup(page);
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    await expect(page.getByText(/you're in/i)).toBeVisible();

    // Synthesise a tiny text file and upload it via the hidden input.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "sample.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is a sample document for e2e testing."),
    });

    // The file is sent to /api/uploads; on success a chip appears in the
    // composer showing the filename.
    await expect(page.locator("span", { hasText: "sample.txt" })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("quota display", () => {
  test("quota bar renders after entering a mode", async ({ page }) => {
    await signup(page);
    await page.getByRole("button", { name: /Quick Brief/ }).click();
    // The sidebar fetches /api/ai/quota on mount; once loaded the remaining/
    // limit text appears. We just assert the pattern renders (values are
    // dynamic so we match the slash separator).
    await expect(page.locator("text=/\\d+\\/\\d+/")).toBeVisible({ timeout: 8_000 });
  });
});
