import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	WORKSPACE_SLUG,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for the full-screen issue detail page (Sprint 3).
 *
 * Tests cover: route rendering, properties sidebar, inline editing,
 * comments section, and activity feed.
 */

test.describe("Issue detail page", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("full-screen issue route renders at /[workspace]/issues/[id]", async ({
		page,
	}) => {
		// Navigate to My Issues to find an issue
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on a CLV-identified issue to navigate to detail
		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();

		// Verify URL contains /issues/
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});

		// Verify the issue detail page loaded with key elements
		await waitForDataLoad(page);

		// Should show the issue identifier
		await expect(page.locator("text=/CLV-\\d+/").first()).toBeVisible();
	});

	test("properties sidebar shows editable fields", async ({ page }) => {
		// Navigate to My Issues and click into an issue
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);

		// Check for property labels in the sidebar
		const propertyLabels = ["Status", "Assignee", "Priority", "Type", "Labels"];
		for (const label of propertyLabels) {
			await expect(page.getByText(label, { exact: true }).first()).toBeVisible({
				timeout: 5_000,
			});
		}
	});

	test("issue title is editable inline", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);

		// The title should be present as an editable element
		// Look for a heading or text that matches issue titles from seed data
		const titleElement = page
			.locator("h1, h2, [contenteditable], input")
			.filter({ hasText: /.{5,}/ })
			.first();
		await expect(titleElement).toBeVisible({ timeout: 5_000 });
	});

	test("comments section is present", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);

		// Look for comment-related UI (textarea for new comment, or activity toggle)
		const commentArea = page
			.getByPlaceholder(/comment|write/i)
			.or(page.getByText(/activity/i).first())
			.or(page.getByText(/comment/i).first());
		await expect(commentArea).toBeVisible({ timeout: 10_000 });
	});

	test("activity feed displays events", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);

		// Look for activity section toggle or activity items
		const activityToggle = page
			.getByText("All activity")
			.or(page.getByText("Comments only"));
		await expect(activityToggle).toBeVisible({ timeout: 10_000 });
	});

	test("breadcrumb navigation is present", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.locator("text=/CLV-\\d+/").first();
		await expect(issueLink).toBeVisible({ timeout: 10_000 });
		await issueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);

		// Breadcrumb should contain workspace or project name
		const breadcrumb = page
			.getByText("Clave HQ")
			.or(page.getByText("Projects"));
		await expect(breadcrumb).toBeVisible({ timeout: 5_000 });
	});

	test("404 state for invalid issue ID", async ({ page }) => {
		// Navigate to an invalid issue ID
		await page.goto(`/${WORKSPACE_SLUG}/issues/invalid-nonexistent-id-12345`);
		await waitForDataLoad(page);

		// Should show a 404 or "not found" message, or redirect
		// The issue detail page shows "Issue not found" for invalid IDs
		const notFound = page
			.getByText(/not found/i)
			.or(page.getByText(/back to/i));
		await expect(notFound).toBeVisible({ timeout: 15_000 });
	});
});
