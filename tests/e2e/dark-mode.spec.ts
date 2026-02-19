import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for dark mode rendering of documents and whiteboards (Sprint 002).
 *
 * Tests cover: verifying dark mode toggle, checking that editors render
 * correctly in dark mode.
 *
 * Auth: Uses dev-login flow to establish an authenticated session.
 */

test.describe("Dark Mode", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("docs page renders in dark mode", async ({ page }) => {
		// Set dark mode via localStorage before navigating
		await page.addInitScript(() => {
			localStorage.setItem("theme", "dark");
		});

		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Verify the page is in dark mode (html element should have class "dark")
		const htmlClass = await page.locator("html").getAttribute("class");
		expect(htmlClass).toContain("dark");

		// Verify the docs page renders without errors
		await expect(page.getByText("Documents").first()).toBeVisible();
	});

	test("boards page renders in dark mode", async ({ page }) => {
		// Set dark mode via localStorage
		await page.addInitScript(() => {
			localStorage.setItem("theme", "dark");
		});

		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Verify dark mode
		const htmlClass = await page.locator("html").getAttribute("class");
		expect(htmlClass).toContain("dark");

		// Verify the boards page renders without errors
		await expect(page.getByText("Boards").first()).toBeVisible();
	});

	test("document editor renders in dark mode", async ({ page }) => {
		// Set dark mode via localStorage
		await page.addInitScript(() => {
			localStorage.setItem("theme", "dark");
		});

		await navigateToWorkspaceRoute(page, "docs");
		await waitForDataLoad(page);

		// Click a document to open editor
		const docCard = page
			.locator("button, a")
			.filter({ hasText: /Test Document|Untitled/ })
			.first();
		await expect(docCard).toBeVisible({ timeout: 10_000 });
		await docCard.click();
		await page.waitForURL("**/docs/**", { timeout: 10_000 });

		// Verify dark mode on editor page
		const htmlClass = await page.locator("html").getAttribute("class");
		expect(htmlClass).toContain("dark");

		// Verify the editor loaded (back button, breadcrumb visible)
		await expect(page.getByRole("button", { name: "Go back" })).toBeVisible();
	});

	test("whiteboard editor renders in dark mode", async ({ page }) => {
		// Set dark mode via localStorage
		await page.addInitScript(() => {
			localStorage.setItem("theme", "dark");
		});

		await navigateToWorkspaceRoute(page, "boards");
		await waitForDataLoad(page);

		// Click a whiteboard
		const boardCard = page
			.locator("button, a")
			.filter({ hasText: /Untitled/ })
			.first();
		await expect(boardCard).toBeVisible({ timeout: 10_000 });
		await boardCard.click();
		await page.waitForURL("**/boards/**", { timeout: 10_000 });

		// Verify dark mode
		const htmlClass = await page.locator("html").getAttribute("class");
		expect(htmlClass).toContain("dark");

		// Verify the Excalidraw canvas loaded in dark mode
		await expect(page.locator(".excalidraw").first()).toBeVisible({
			timeout: 15_000,
		});
	});
});
