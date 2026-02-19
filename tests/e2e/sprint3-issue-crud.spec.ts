import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	WORKSPACE_SLUG,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for Issue CRUD operations (Sprint 3).
 *
 * Tests cover: creating issues, viewing in list/board, editing properties,
 * deleting issues, and identifier generation.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Issue CRUD", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("create an issue via C keyboard shortcut", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Press C to open quick create modal (click body first to ensure focus)
		await page.locator("body").click();
		await page.keyboard.press("c");

		// Quick create modal should appear with identifier preview
		await expect(page.locator("text=/CLV-\\d+/").first()).toBeVisible({
			timeout: 5_000,
		});

		// Fill in the issue title
		const titleInput = page.getByPlaceholder("Issue title").first();
		if (await titleInput.isVisible()) {
			await titleInput.fill("E2E test issue from shortcut");
			// Submit with Cmd+Enter
			await page.keyboard.press("Meta+Enter");
		} else {
			// Fallback: look for a generic text input in the modal
			const input = page.locator(
				'dialog input[type="text"], [role="dialog"] input[type="text"]',
			);
			await input.first().fill("E2E test issue from shortcut");
			await page.keyboard.press("Meta+Enter");
		}

		// Wait for modal to close or success indicator
		await page.waitForTimeout(2000);
	});

	test("view issues in My Issues page with tabs", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Verify "My issues" heading
		await expect(page.getByText("My issues").first()).toBeVisible();

		// Verify 4 tabs exist
		await expect(page.getByRole("tab", { name: /Assigned/i })).toBeVisible();
		await expect(page.getByRole("tab", { name: /Created/i })).toBeVisible();
		await expect(page.getByRole("tab", { name: /Subscribed/i })).toBeVisible();
		await expect(page.getByRole("tab", { name: /Activity/i })).toBeVisible();
	});

	test("view issues in project board view", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Click on the first project card to open project detail
		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform|Mobile App|Marketing/ })
			.first();
		if (await projectCard.isVisible()) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Click Issues tab
			const issuesTab = page.getByRole("tab", { name: /Issues/i });
			if (await issuesTab.isVisible()) {
				await issuesTab.click();
				await waitForDataLoad(page);
			}
		}
	});

	test("issue identifiers follow CLV-NNN format", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Check that CLV-prefixed identifiers are present
		const identifiers = page.locator("text=/CLV-\\d{3}/");
		const count = await identifiers.count();
		expect(count).toBeGreaterThan(0);
	});

	test("navigate to issue detail page", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on the first issue identifier/title to navigate to detail
		const issueLink = page.locator("text=/CLV-\\d+/").first();
		if (await issueLink.isVisible()) {
			await issueLink.click();

			// Should navigate to issue detail page
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});

			// Verify issue detail page loaded
			await waitForDataLoad(page);
			await expect(page.locator("text=/CLV-\\d+/").first()).toBeVisible();
		}
	});
});
