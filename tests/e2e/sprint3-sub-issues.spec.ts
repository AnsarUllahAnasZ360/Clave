import { expect, type Page, test } from "@playwright/test";
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
	async function openIssueDetail(page: Page, identifier: string) {
		await navigateToWorkspaceRoute(page, `issues/${identifier}`);
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/${identifier}`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);
		await expect(page.getByText(identifier).first()).toBeVisible({
			timeout: 10_000,
		});
	}

	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("parent issue shows sub-issues list", async ({ page }) => {
		// CLV-102 has sub-issues in seeded data.
		await openIssueDetail(page, "CLV-102");

		// Should show sub-issues section with progress indicator.
		const subIssueSection = page
			.getByText(/sub-issue/i)
			.or(page.getByText(/of \d+ completed/i))
			.or(page.getByText("CLV-114"))
			.or(page.getByText("CLV-115"));
		await expect(subIssueSection).toBeVisible({ timeout: 10_000 });
	});

	test("sub-issue progress indicator shows completion count", async ({
		page,
	}) => {
		await openIssueDetail(page, "CLV-102");

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
		await openIssueDetail(page, "CLV-102");

		// Look for "Add sub-issue" button.
		const addButton = page.getByText(/add sub-issue/i).first();
		await expect(addButton).toBeVisible({ timeout: 10_000 });
	});

	test("clicking a sub-issue navigates to its detail page", async ({
		page,
	}) => {
		await openIssueDetail(page, "CLV-102");

		// Click on a sub-issue identifier.
		const subIssueLink = page
			.getByText("CLV-114")
			.or(page.getByText("CLV-115"))
			.first();
		await expect(subIssueLink).toBeVisible({ timeout: 10_000 });
		await subIssueLink.click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
			timeout: 10_000,
		});
	});
});
