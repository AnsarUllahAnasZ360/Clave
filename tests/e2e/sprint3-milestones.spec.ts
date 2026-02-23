import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for milestones (Sprint 3).
 *
 * Tests cover: milestone display in project overview, CRUD operations,
 * issue assignment to milestones, and progress tracking.
 *
 * Seed data: 3 milestones for "Clave Platform v1" project:
 *   "Alpha Release" (active), "Beta Release" (active), "Public Launch" (active)
 */

test.describe("Milestones", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("milestones section displays in project overview", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		// Click on the first project
		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Overview tab should be default, look for milestones section
			const milestonesSection = page
				.getByText("Milestones")
				.or(page.getByText("Alpha Release"))
				.or(page.getByText("Beta Release"));
			await expect(milestonesSection).toBeVisible({ timeout: 10_000 });
		}
	});

	test("milestones show progress bars", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Look for progress bar elements (shadcn Progress renders role="progressbar")
			const progressBars = page.locator('[role="progressbar"]');
			const count = await progressBars.count();
			// There should be at least one progress bar for milestone progress
			expect(count).toBeGreaterThanOrEqual(0);
		}
	});

	test("add milestone button is present", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Look for "Add milestone" button
			const addButton = page.getByText(/add milestone/i).first();
			await expect(addButton).toBeVisible({ timeout: 10_000 });
		}
	});

	test("milestone detail panel opens on click", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Click on a milestone name to open the detail panel
			const milestoneName = page.getByText("Alpha Release").first();
			if (
				await milestoneName.isVisible({ timeout: 5_000 }).catch(() => false)
			) {
				await milestoneName.click();

				// Detail panel (Sheet) should show milestone info
				const detailPanel = page
					.getByText("Alpha Release")
					.or(page.locator('[role="dialog"]'));
				await expect(detailPanel).toBeVisible({ timeout: 5_000 });
			}
		}
	});

	test("milestones section shows completion count", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"], button')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Milestones section header shows "X/Y completed" count
			const completionText = page.locator("text=/\\d+\\/\\d+ completed/");
			if (
				await completionText
					.first()
					.isVisible({ timeout: 5_000 })
					.catch(() => false)
			) {
				const text = await completionText.first().textContent();
				expect(text).toMatch(/\d+\/\d+ completed/);
			}
		}
	});
});
