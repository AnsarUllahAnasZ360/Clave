import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	WORKSPACE_SLUG,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for navigation between docs, boards, and sidebar links (Sprint 002).
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("sidebar shows Docs and Boards navigation items", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Verify sidebar has Docs and Boards links
		await expect(page.getByRole("link", { name: "Docs" })).toBeVisible({
			timeout: 10_000,
		});
		await expect(page.getByRole("link", { name: "Boards" })).toBeVisible();
	});

	test("sidebar Docs link navigates to workspace docs page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Click Docs in sidebar
		await page.getByRole("link", { name: "Docs" }).click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/docs`, {
			timeout: 10_000,
		});

		// Verify the docs page loaded
		await expect(page.getByText("Documents").first()).toBeVisible();
	});

	test("sidebar Boards link navigates to workspace boards page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Click Boards in sidebar
		await page.getByRole("link", { name: "Boards" }).click();
		await page.waitForURL(`**/${WORKSPACE_SLUG}/boards`, {
			timeout: 10_000,
		});

		// Verify the boards page loaded
		await expect(page.getByText("Boards").first()).toBeVisible();
	});

	test("navigate from docs list to doc editor and back", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Click a document
		const docCard = page
			.locator("button, a")
			.filter({ hasText: /Test Document|Untitled/ })
			.first();
		await expect(docCard).toBeVisible({ timeout: 10_000 });
		await docCard.click();

		// Verify we're in the editor
		await page.waitForURL("**/docs/**", { timeout: 10_000 });
		await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();

		// Go back
		await page.getByRole("button", { name: "Go back" }).click();
		await page.waitForTimeout(2000);

		// Should be back on a page (project or docs list)
		const url = page.url();
		expect(url).not.toMatch(/\/docs\/[a-z0-9]{32}$/);
	});

	test("navigate from boards list to board editor and back", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Click a whiteboard
		const boardCard = page
			.locator("button, a")
			.filter({ hasText: /Untitled/ })
			.first();
		await expect(boardCard).toBeVisible({ timeout: 10_000 });
		await boardCard.click();

		// Verify we're in the editor
		await page.waitForURL("**/boards/**", { timeout: 10_000 });
		await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();

		// Go back
		await page.getByRole("button", { name: "Go back" }).click();
		await page.waitForTimeout(2000);

		// Should be back on a page (project or boards list)
		const url = page.url();
		expect(url).not.toMatch(/\/boards\/[a-z0-9]{32}$/);
	});
});
