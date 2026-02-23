import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for Whiteboard CRUD operations (Sprint 002).
 *
 * Tests cover: navigating to boards page, opening whiteboard editor,
 * verifying Excalidraw canvas loads, and whiteboard list rendering.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Whiteboard CRUD", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("workspace boards page renders whiteboard list", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Verify page heading
		await expect(page.getByText("Boards").first()).toBeVisible();

		// Verify at least one whiteboard card is visible (seeded data)
		await expect(
			page
				.locator("main [role='button']")
				.filter({ hasText: /Untitled/ })
				.first(),
		).toBeVisible({ timeout: 10_000 });
	});

	test("click whiteboard opens full-page editor with Excalidraw", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Click the first visible whiteboard card in main content.
		const boardCard = page
			.locator("main [role='button']")
			.filter({ hasText: /Untitled/ })
			.first();
		await expect(boardCard).toBeVisible({ timeout: 10_000 });
		await boardCard.click();

		// Wait for navigation to the full-page whiteboard editor
		await page.waitForURL("**/boards/**", { timeout: 10_000 });

		// Verify the editor page structure: breadcrumb + actions
		await expect(page.getByText("Boards").first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Options" })).toBeVisible();

		// Verify the Excalidraw canvas loaded
		await expect(page.locator(".excalidraw").first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test("whiteboard editor has back navigation", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Open a visible whiteboard card in main content.
		const boardCard = page
			.locator("main [role='button']")
			.filter({ hasText: /Untitled/ })
			.first();
		await expect(boardCard).toBeVisible({ timeout: 10_000 });
		await boardCard.click();
		await page.waitForURL("**/boards/**", { timeout: 10_000 });

		// Use browser history back navigation
		await page.goBack();

		// Should navigate away from the board editor
		await page.waitForTimeout(2000);
		const url = page.url();
		expect(url).not.toMatch(/\/boards\/[a-z0-9]{32}$/);
	});
});
