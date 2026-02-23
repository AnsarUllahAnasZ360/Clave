import { expect, type Page, test } from "@playwright/test";
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

const SEEDED_ISSUE_IDENTIFIERS = ["CLV-100", "CLV-102", "CLV-106"] as const;

async function openSeededIssueDetail(page: Page) {
	for (const identifier of SEEDED_ISSUE_IDENTIFIERS) {
		await navigateToWorkspaceRoute(page, `issues/${identifier}`);
		await page.waitForURL(`**/issues/${identifier}`, { timeout: 15_000 });
		await waitForDataLoad(page);

		const notFoundHeading = page.getByRole("heading", {
			name: "Issue not found",
		});
		if (
			await notFoundHeading.isVisible({ timeout: 2_000 }).catch(() => false)
		) {
			continue;
		}

		await expect(page.getByText(identifier).first()).toBeVisible({
			timeout: 10_000,
		});
		return identifier;
	}

	throw new Error(
		`Could not open a seeded issue detail route from: ${SEEDED_ISSUE_IDENTIFIERS.join(", ")}`,
	);
}

function getCommentEditor(page: Page) {
	return page.locator(".tiptap-editor").last();
}

test.describe("Rich Text Comments", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("issue detail page shows activity/comments section", async ({
		page,
	}) => {
		await openSeededIssueDetail(page);

		// Scroll to the Activity section at the bottom
		const activityHeading = page.getByRole("heading", { name: "Activity" });
		await activityHeading.scrollIntoViewIfNeeded();

		// Verify the Activity section is visible
		await expect(activityHeading).toBeVisible({ timeout: 10_000 });
	});

	test("comment editor is visible on issue detail", async ({ page }) => {
		await openSeededIssueDetail(page);
		await expect(page.getByText("Cmd+Enter to submit")).toBeVisible({
			timeout: 10_000,
		});

		// Scroll to the activity comment editor at the bottom.
		const editor = getCommentEditor(page);
		await editor.scrollIntoViewIfNeeded();
		await expect(editor).toBeVisible({ timeout: 10_000 });
	});

	test("can type in comment editor", async ({ page }) => {
		await openSeededIssueDetail(page);
		await expect(page.getByText("Cmd+Enter to submit")).toBeVisible({
			timeout: 10_000,
		});

		// Scroll to and click the comment editor
		const editor = getCommentEditor(page);
		await editor.scrollIntoViewIfNeeded();
		await expect(editor).toBeVisible({ timeout: 10_000 });
		await editor.click();
		await page.keyboard.type("E2E test comment");

		// Verify text was typed
		await expect(editor).toContainText("E2E test comment");
	});
});
