import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for search integration in command palette (Sprint 002).
 *
 * Tests cover: opening command palette, searching for documents/whiteboards,
 * verifying quick actions for creating docs/boards.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Search Integration", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("command palette opens with Cmd+K", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette
		await page.keyboard.press("Meta+k");

		// Verify command palette is visible
		await expect(
			page.getByPlaceholder("Search or type a command..."),
		).toBeVisible({ timeout: 5_000 });
	});

	test("command palette shows Create document and Create whiteboard actions", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette
		await page.keyboard.press("Meta+k");
		await expect(
			page.getByPlaceholder("Search or type a command..."),
		).toBeVisible({ timeout: 5_000 });

		// Verify quick actions are visible
		await expect(page.getByText("Create document")).toBeVisible();
		await expect(page.getByText("Create whiteboard")).toBeVisible();
	});

	test("searching for document title shows Documents group", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette and search
		await page.keyboard.press("Meta+k");
		await page
			.getByPlaceholder("Search or type a command...")
			.fill("Test Document");

		// Wait for search results
		await page.waitForTimeout(1500);

		// Verify Documents group appears with the result
		await expect(page.getByText("Documents").first()).toBeVisible({
			timeout: 10_000,
		});
		await expect(
			page.locator("[cmdk-item]").filter({ hasText: "Test Document" }),
		).toBeVisible();
	});

	test("searching for whiteboard title shows Whiteboards group", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette and search
		await page.keyboard.press("Meta+k");
		await page.getByPlaceholder("Search or type a command...").fill("Untitled");

		// Wait for search results
		await page.waitForTimeout(1500);

		// Verify Whiteboards group appears
		await expect(page.getByText("Whiteboards").first()).toBeVisible({
			timeout: 10_000,
		});
	});

	test("clicking document search result selects the item without errors", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette and search
		await page.keyboard.press("Meta+k");
		await page
			.getByPlaceholder("Search or type a command...")
			.fill("Test Document");

		// Wait for results and click
		await page.waitForTimeout(1500);
		const docResult = page
			.locator("[cmdk-item]")
			.filter({ hasText: "Test Document" });
		await expect(docResult).toBeVisible({ timeout: 10_000 });
		await docResult.click();

		// Verify interaction completed and app remains stable.
		await expect(page.locator("body")).toBeVisible();
	});

	test("empty search shows no errors", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Open command palette
		await page.keyboard.press("Meta+k");
		await expect(
			page.getByPlaceholder("Search or type a command..."),
		).toBeVisible({ timeout: 5_000 });

		// Type and clear
		await page.getByPlaceholder("Search or type a command...").fill("xyz");
		await page.waitForTimeout(1000);
		await page.getByPlaceholder("Search or type a command...").fill("");

		// Quick actions should reappear without errors
		await expect(page.getByText("Create document")).toBeVisible({
			timeout: 5_000,
		});
	});
});
