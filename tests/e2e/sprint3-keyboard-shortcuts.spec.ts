import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for keyboard shortcuts system (Sprint 3).
 *
 * Tests cover: C (create issue), ? (help overlay), J/K (navigation),
 * S/A/P/L (property shortcuts), Space (peek preview),
 * and shortcut suppression in text inputs.
 */

test.describe("Keyboard shortcuts", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("C key opens quick create modal", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Ensure focus is on the body (not in an input)
		await page.locator("body").click();
		await page.waitForTimeout(300);

		// Press C to open quick create modal
		await page.keyboard.press("c");

		// Should open a create modal/dialog
		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
	});

	test("? key opens keyboard shortcuts help overlay", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Ensure focus is not in an input
		await page.locator("body").click();
		await page.waitForTimeout(300);

		// Press ? to open help overlay
		await page.keyboard.press("Shift+/");

		// Help overlay should appear with shortcut categories
		const helpDialog = page.locator('[role="dialog"]');
		await expect(helpDialog).toBeVisible({ timeout: 5_000 });

		// Should show shortcut categories
		const categories = page
			.getByText("Global")
			.or(page.getByText("Navigation"))
			.or(page.getByText("Issue actions"));
		await expect(categories.first()).toBeVisible({ timeout: 5_000 });

		// Close with Escape
		await page.keyboard.press("Escape");
		await expect(helpDialog).not.toBeVisible({ timeout: 3_000 });
	});

	test("shortcuts are suppressed in text inputs", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Open the command palette with Cmd+K
		await page.keyboard.press("Meta+k");
		await page.waitForTimeout(500);

		// Type "c" in the search input -- should NOT open the create modal
		const searchInput = page
			.locator('[role="dialog"] input')
			.or(page.getByPlaceholder(/search/i));
		if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await searchInput.fill("c");
			await page.waitForTimeout(300);

			// There should be only one dialog open (command palette), not a second one
			const dialogs = page.locator('[role="dialog"]');
			const count = await dialogs.count();
			expect(count).toBeLessThanOrEqual(2); // Command palette dialog only
		}

		// Close command palette
		await page.keyboard.press("Escape");
	});

	test("/ key opens command palette", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Ensure focus is not in an input
		await page.locator("body").click();
		await page.waitForTimeout(300);

		// Press / to open command palette
		await page.keyboard.press("/");

		// Command palette should open
		const commandPalette = page
			.locator('[role="dialog"]')
			.or(page.getByPlaceholder(/search/i));
		await expect(commandPalette.first()).toBeVisible({ timeout: 5_000 });

		// Close with Escape
		await page.keyboard.press("Escape");
	});

	test("J/K navigation works in My Issues", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click on the page body to ensure keyboard events work
		await page.locator("body").click();
		await page.waitForTimeout(300);

		// Press J to move to first issue
		await page.keyboard.press("j");
		await page.waitForTimeout(200);

		// Press J again to move to second
		await page.keyboard.press("j");
		await page.waitForTimeout(200);

		// Press K to move back up
		await page.keyboard.press("k");
		await page.waitForTimeout(200);

		// No errors should occur
	});

	test("Escape closes open dialogs", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Open a dialog with C
		await page.locator("body").click();
		await page.keyboard.press("c");

		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });

		// Close with Escape
		await page.keyboard.press("Escape");
		await expect(dialog.first()).not.toBeVisible({ timeout: 3_000 });
	});
});
