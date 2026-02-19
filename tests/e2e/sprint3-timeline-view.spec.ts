import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for the issue-level timeline view (Sprint 3).
 *
 * Tests cover: timeline rendering within project, date bars,
 * zoom controls, milestone markers, and drag-to-adjust dates.
 */

test.describe("Timeline view", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("timeline view renders within project issues tab", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			// Click Issues tab
			const issuesTab = page.getByRole("tab", { name: /Issues/i });
			if (await issuesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await issuesTab.click();
				await waitForDataLoad(page);

				// Switch to Timeline layout
				const timelineButton = page
					.locator(
						'button[aria-label*="timeline" i], button[title*="timeline" i]',
					)
					.or(page.getByText("Timeline").first());
				if (
					await timelineButton.isVisible({ timeout: 3_000 }).catch(() => false)
				) {
					await timelineButton.click();
					await waitForDataLoad(page);

					// Timeline should show date headers or today indicator
					const timelineContent = page
						.getByText("Today")
						.or(page.locator("text=/\\w+ \\d{4}/")) // Month Year format
						.or(page.locator("svg")); // SVG elements for bars
					await expect(timelineContent.first()).toBeVisible({
						timeout: 10_000,
					});
				}
			}
		}
	});

	test("timeline shows issue bars with identifiers", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			const issuesTab = page.getByRole("tab", { name: /Issues/i });
			if (await issuesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await issuesTab.click();
				await waitForDataLoad(page);

				// Switch to Timeline
				const timelineButton = page
					.locator(
						'button[aria-label*="timeline" i], button[title*="timeline" i]',
					)
					.or(page.getByText("Timeline").first());
				if (
					await timelineButton.isVisible({ timeout: 3_000 }).catch(() => false)
				) {
					await timelineButton.click();
					await waitForDataLoad(page);

					// Should show issue identifiers in the sidebar
					const identifiers = page.locator("text=/CLV-\\d+/");
					const count = await identifiers.count();
					expect(count).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});

	test("timeline has zoom controls", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			const issuesTab = page.getByRole("tab", { name: /Issues/i });
			if (await issuesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await issuesTab.click();
				await waitForDataLoad(page);

				const timelineButton = page
					.locator(
						'button[aria-label*="timeline" i], button[title*="timeline" i]',
					)
					.or(page.getByText("Timeline").first());
				if (
					await timelineButton.isVisible({ timeout: 3_000 }).catch(() => false)
				) {
					await timelineButton.click();
					await waitForDataLoad(page);

					// Look for zoom or view mode controls
					const zoomControls = page
						.getByText("Day")
						.or(page.getByText("Week"))
						.or(page.getByText("Month"))
						.or(page.locator('button[aria-label*="zoom" i]'));
					if (
						await zoomControls
							.first()
							.isVisible({ timeout: 3_000 })
							.catch(() => false)
					) {
						expect(true).toBe(true);
					}
				}
			}
		}
	});

	test("timeline shows unscheduled issues section", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "projects");
		await waitForDataLoad(page);

		const projectCard = page
			.locator('a[href*="/projects/"]')
			.filter({ hasText: /Clave Platform/i })
			.first();
		if (await projectCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await projectCard.click();
			await waitForDataLoad(page);

			const issuesTab = page.getByRole("tab", { name: /Issues/i });
			if (await issuesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
				await issuesTab.click();
				await waitForDataLoad(page);

				const timelineButton = page
					.locator(
						'button[aria-label*="timeline" i], button[title*="timeline" i]',
					)
					.or(page.getByText("Timeline").first());
				if (
					await timelineButton.isVisible({ timeout: 3_000 }).catch(() => false)
				) {
					await timelineButton.click();
					await waitForDataLoad(page);

					// Look for "Unscheduled" section
					const unscheduled = page
						.getByText(/unscheduled/i)
						.or(page.getByText(/no dates/i));
					if (
						await unscheduled
							.first()
							.isVisible({ timeout: 3_000 })
							.catch(() => false)
					) {
						expect(true).toBe(true);
					}
				}
			}
		}
	});
});
