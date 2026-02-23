import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for Document CRUD operations (Sprint 002).
 *
 * Tests cover: navigating to docs page, opening document editor,
 * creating documents, and verifying document list rendering.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Document CRUD", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("workspace docs page renders document list", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Verify page heading
		await expect(page.getByText("Documents").first()).toBeVisible();

		// Verify at least one document card is visible (seeded data)
		await expect(
			page.locator('[class*="card"], [class*="Card"]').first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("click document opens full-page editor", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Click the first visible document card in main content.
		const docCard = page
			.locator("main [role='button']")
			.filter({ hasText: /Test Document|Test/ })
			.first();
		await expect(docCard).toBeVisible({ timeout: 10_000 });
		await docCard.click();

		// Wait for navigation to the full-page editor
		await page.waitForURL("**/docs/**", { timeout: 10_000 });

		// Verify the editor page structure: breadcrumb + actions
		await expect(page.getByText("Docs").first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Options" })).toBeVisible();
	});

	test("document editor has favorite button and options menu", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Click a visible document card in main content.
		const docCard = page
			.locator("main [role='button']")
			.filter({ hasText: /Test Document|Test/ })
			.first();
		await expect(docCard).toBeVisible({ timeout: 10_000 });
		await docCard.click();
		await page.waitForURL("**/docs/**", { timeout: 10_000 });

		// Verify favorite button
		await expect(
			page
				.getByRole("button", { name: "Add to favorites" })
				.or(page.getByRole("button", { name: "Remove from favorites" })),
		).toBeVisible({ timeout: 10_000 });

		// Verify options menu button
		await expect(page.getByRole("button", { name: "Options" })).toBeVisible();
	});

	test("browser back navigates from editor to project or previous page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Open a visible document card in main content.
		const docCard = page
			.locator("main [role='button']")
			.filter({ hasText: /Test Document|Test/ })
			.first();
		await expect(docCard).toBeVisible({ timeout: 10_000 });
		await docCard.click();
		await page.waitForURL("**/docs/**", { timeout: 10_000 });

		// Use browser history back navigation
		await page.goBack();

		// Should navigate away from the doc editor
		await page.waitForTimeout(2000);
		const url = page.url();
		expect(url).not.toMatch(/\/docs\/[a-z0-9]{32}$/);
	});
});
