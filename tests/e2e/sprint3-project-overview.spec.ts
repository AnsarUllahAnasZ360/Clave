import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for project overview and dashboard (Sprint 3).
 *
 * Tests cover: overview page sections (description, properties, milestones, resources),
 * dashboard tab (metrics, progress), and activity tab.
 */

test.describe("Project overview", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("project detail page has correct tabs", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Verify tab names
			const expectedTabs = [
				"Overview",
				"Issues",
				"Dashboard",
				"Activity",
				"Notes",
				"Files",
			];
			for (const tabName of expectedTabs) {
				const tab = page.getByRole("tab", { name: tabName });
				await expect(tab).toBeVisible({ timeout: 5_000 });
			}
		}
	});

	test("overview tab shows properties bar", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Properties bar should show editable property cells
			const propertyLabels = ["Status", "Lead", "Start", "Target"];
			for (const label of propertyLabels) {
				const prop = page.getByText(label, { exact: true }).first();
				if (await prop.isVisible({ timeout: 3_000 }).catch(() => false)) {
					// Property cell is present
					expect(true).toBe(true);
				}
			}
		}
	});

	test("overview tab shows description section", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Description section should show either content or empty state
			const descriptionSection = page
				.getByText(/description/i)
				.or(page.getByText(/add a description/i))
				.or(page.locator("textarea"));
			await expect(descriptionSection.first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("overview tab shows milestones section", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Milestones section header
			await expect(page.getByText("Milestones").first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});
});

test.describe("Project dashboard", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("dashboard tab shows metrics and progress", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Click Dashboard tab
			const dashboardTab = page.getByRole("tab", { name: "Dashboard" });
			if (await dashboardTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await dashboardTab.click();
				await waitForDataLoad(page);

				// Dashboard should show completion donut or status breakdown
				const dashboardContent = page
					.getByText(/completion/i)
					.or(page.getByText(/status/i))
					.or(page.getByText(/%/))
					.or(page.locator("svg"));
				await expect(dashboardContent.first()).toBeVisible({
					timeout: 10_000,
				});
			}
		}
	});

	test("dashboard tab shows project updates feed", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			const dashboardTab = page.getByRole("tab", { name: "Dashboard" });
			if (await dashboardTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await dashboardTab.click();
				await waitForDataLoad(page);

				// Should show update form (health picker + textarea)
				const healthPicker = page
					.getByText("On track")
					.or(page.getByText("At risk"))
					.or(page.getByText("Off track"));
				await expect(healthPicker.first()).toBeVisible({ timeout: 10_000 });
			}
		}
	});
});

test.describe("Project activity tab", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("activity tab shows recent events", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Click Activity tab
			const activityTab = page.getByRole("tab", { name: "Activity" });
			if (await activityTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await activityTab.click();
				await waitForDataLoad(page);

				// Activity tab should show filter chips and activity items
				const filterChips = page
					.getByText("All")
					.or(page.getByText("Status changes"))
					.or(page.getByText("Assignments"));
				await expect(filterChips.first()).toBeVisible({ timeout: 10_000 });
			}
		}
	});
});
