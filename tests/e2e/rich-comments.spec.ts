import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for rich text comments with TipTap (Sprint 002).
 *
 * Tests cover: viewing comments on issues, the comment editor,
 * and submitting comments.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Rich Text Comments", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("issue detail page shows activity/comments section", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on an issue to open preview sidebar
		const issueRow = page.locator("text=/CLV-\\d+/").first();
		await expect(issueRow).toBeVisible({ timeout: 10_000 });
		await issueRow.click();
		await waitForDataLoad(page);

		// Click the "Open full page" button to navigate to issue detail
		const expandBtn = page.getByTitle("Open full page");
		await expect(expandBtn).toBeVisible({ timeout: 10_000 });
		await expandBtn.click();
		await page.waitForURL("**/issues/**", { timeout: 10_000 });
		await waitForDataLoad(page);

		// Scroll to the Activity section at the bottom
		const activityHeading = page.getByText("Activity").first();
		await activityHeading.scrollIntoViewIfNeeded();

		// Verify the Activity section is visible
		await expect(activityHeading).toBeVisible({ timeout: 10_000 });
	});

	test("comment editor is visible on issue detail", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on an issue to open preview sidebar
		const issueRow = page.locator("text=/CLV-\\d+/").first();
		await expect(issueRow).toBeVisible({ timeout: 10_000 });
		await issueRow.click();
		await waitForDataLoad(page);

		// Navigate to full issue detail page
		const expandBtn = page.getByTitle("Open full page");
		await expect(expandBtn).toBeVisible({ timeout: 10_000 });
		await expandBtn.click();
		await page.waitForURL("**/issues/**", { timeout: 10_000 });
		await waitForDataLoad(page);

		// Scroll to the comment editor at the bottom (TipTap uses .ProseMirror class)
		const editor = page.locator(".tiptap-editor, .ProseMirror").first();
		await editor.scrollIntoViewIfNeeded();
		await expect(editor).toBeVisible({ timeout: 10_000 });
	});

	test("can type in comment editor", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on an issue to open preview sidebar
		const issueRow = page.locator("text=/CLV-\\d+/").first();
		await expect(issueRow).toBeVisible({ timeout: 10_000 });
		await issueRow.click();
		await waitForDataLoad(page);

		// Navigate to full issue detail page
		const expandBtn = page.getByTitle("Open full page");
		await expect(expandBtn).toBeVisible({ timeout: 10_000 });
		await expandBtn.click();
		await page.waitForURL("**/issues/**", { timeout: 10_000 });
		await waitForDataLoad(page);

		// Scroll to and click the comment editor
		const editor = page.locator(".tiptap-editor, .ProseMirror").first();
		await editor.scrollIntoViewIfNeeded();
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.type("E2E test comment");

		// Verify text was typed
		await expect(editor).toContainText("E2E test comment");
	});
});
