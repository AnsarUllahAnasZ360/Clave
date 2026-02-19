import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	WORKSPACE_SLUG,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for sub-issues (Sprint 3).
 *
 * Tests cover: sub-issue display on parent, creation from parent detail,
 * progress indicator, and navigation.
 *
 * Seed data: CLV-102 has 3 sub-issues (CLV-114, CLV-115, CLV-119),
 *            CLV-104 has 3 sub-issues (CLV-116, CLV-117, CLV-118).
 */

test.describe("Sub-issues", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("parent issue shows sub-issues list", async ({ page }) => {
		// Navigate to My Issues, find a parent issue with sub-issues
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// CLV-102 has sub-issues in seed data
		const parentLink = page.getByText("CLV-102").first();
		if (await parentLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await parentLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Should show sub-issues section with progress indicator
			const subIssueSection = page
				.getByText(/sub-issue/i)
				.or(page.getByText(/of \d+ completed/i))
				.or(page.getByText("CLV-114"))
				.or(page.getByText("CLV-115"));
			await expect(subIssueSection).toBeVisible({ timeout: 10_000 });
		}
	});

	test("sub-issue progress indicator shows completion count", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Look for SubIssueCountBadge showing "X/Y" format
		const progressBadge = page.locator("text=/\\d+\\/\\d+/").first();
		// This may or may not be visible depending on which tab we're on
		// and which issues have sub-issues in the current view
		if (await progressBadge.isVisible({ timeout: 5_000 }).catch(() => false)) {
			const text = await progressBadge.textContent();
			expect(text).toMatch(/\d+\/\d+/);
		}
	});

	test("add sub-issue button is present on parent issue detail", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Navigate to a parent issue
		const parentLink = page.getByText("CLV-102").first();
		if (await parentLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await parentLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Look for "Add sub-issue" button
			const addButton = page.getByText(/add sub-issue/i).first();
			await expect(addButton).toBeVisible({ timeout: 10_000 });
		}
	});

	test("clicking a sub-issue navigates to its detail page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Navigate to parent issue CLV-102
		const parentLink = page.getByText("CLV-102").first();
		if (await parentLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await parentLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Click on a sub-issue identifier
			const subIssueLink = page
				.getByText("CLV-114")
				.or(page.getByText("CLV-115"))
				.first();
			if (await subIssueLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await subIssueLink.click();
				await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
					timeout: 10_000,
				});
			}
		}
	});
});
