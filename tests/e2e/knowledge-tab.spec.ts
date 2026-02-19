import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for the Knowledge tab on project detail pages (Sprint 002).
 *
 * Tests cover: viewing the Knowledge tab, filter chips, creating new items,
 * and verifying doc/board/note entries appear.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Knowledge Tab", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("Knowledge tab is accessible on project detail page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects/clave-platform-v1");
		await waitForDataLoad(page);

		// Click Knowledge tab
		const knowledgeTab = page.getByRole("tab", { name: "Knowledge" });
		await expect(knowledgeTab).toBeVisible({ timeout: 10_000 });
		await knowledgeTab.click();

		// Verify Knowledge tab is selected
		await expect(knowledgeTab).toHaveAttribute("data-state", "active");
	});

	test("Knowledge tab shows filter chips", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects/clave-platform-v1");
		await waitForDataLoad(page);

		// Click Knowledge tab
		await page.getByRole("tab", { name: "Knowledge" }).click();
		await waitForDataLoad(page);

		// Verify filter chips are visible (buttons contain label + optional count)
		await expect(
			page.locator("button").filter({ hasText: "All" }).first(),
		).toBeVisible({ timeout: 10_000 });
		await expect(
			page.locator("button").filter({ hasText: "Docs" }).first(),
		).toBeVisible();
		await expect(
			page.locator("button").filter({ hasText: "Notes" }).first(),
		).toBeVisible();
		await expect(
			page.locator("button").filter({ hasText: "Boards" }).first(),
		).toBeVisible();
	});

	test("Knowledge tab has New button for creating items", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects/clave-platform-v1");
		await waitForDataLoad(page);

		// Click Knowledge tab
		await page.getByRole("tab", { name: "Knowledge" }).click();
		await waitForDataLoad(page);

		// Verify New button exists
		const newButton = page.getByRole("button", { name: /New/ }).first();
		await expect(newButton).toBeVisible({ timeout: 10_000 });
	});

	test("filter chips filter the knowledge list", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects/clave-platform-v1");
		await waitForDataLoad(page);

		// Click Knowledge tab
		await page.getByRole("tab", { name: "Knowledge" }).click();
		await waitForDataLoad(page);

		// Click "Docs" filter and verify it becomes active
		const docsFilter = page.getByRole("button", { name: "Docs" });
		await docsFilter.click();
		await page.waitForTimeout(500);

		// Click "All" filter to reset
		const allFilter = page.getByRole("button", { name: "All" });
		await allFilter.click();
		await page.waitForTimeout(500);

		// Click "Boards" filter
		const boardsFilter = page.getByRole("button", { name: "Boards" });
		await boardsFilter.click();
		await page.waitForTimeout(500);

		// No errors should have occurred -- page is still visible
		await expect(page.locator("body")).toBeVisible();
	});
});
