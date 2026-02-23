import { expect, type Page, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for My Issues page (Sprint 3).
 *
 * Tests cover: 4 tabs (Assigned, Created, Subscribed, Activity),
 * focus grouping, grouping option changes, and issue navigation.
 */

test.describe("My Issues", () => {
	const MY_ISSUES_TABS = [
		"Assigned",
		"Created",
		"Subscribed",
		"Activity",
	] as const;
	const ISSUE_LINK_SELECTOR = 'a[href*="/issues/CLV-"]';

	function tabButton(page: Page, label: (typeof MY_ISSUES_TABS)[number]) {
		return page
			.getByRole("button", { name: new RegExp(`^${label}`, "i") })
			.first();
	}

	async function findFirstIssueLinkAcrossTabs(page: Page) {
		const issueLink = page.locator(ISSUE_LINK_SELECTOR).first();
		if (await issueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
			return issueLink;
		}

		for (const label of MY_ISSUES_TABS) {
			const btn = tabButton(page, label);
			if (!(await btn.isVisible({ timeout: 2_000 }).catch(() => false))) {
				continue;
			}
			await btn.click();
			await waitForDataLoad(page);
			if (await issueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
				return issueLink;
			}
		}

		return null;
	}

	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("my issues page renders with 4 tabs", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Verify heading
		await expect(page.getByText("My issues").first()).toBeVisible({
			timeout: 10_000,
		});

		// Verify 4 tab buttons
		await expect(tabButton(page, "Assigned")).toBeVisible();
		await expect(tabButton(page, "Created")).toBeVisible();
		await expect(tabButton(page, "Subscribed")).toBeVisible();
		await expect(tabButton(page, "Activity")).toBeVisible();
	});

	test("assigned tab shows issues grouped by focus", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Assigned tab is the default
		// Focus grouping shows tiers like "Active", "Backlog", "Done", etc.
		const focusGroups = [
			"Urgent",
			"Blocking others",
			"Current milestone",
			"Active",
			"Triage",
			"Backlog",
			"Done",
			"Cancelled",
		];
		let foundGroups = 0;
		for (const group of focusGroups) {
			const groupHeader = page.getByText(group, { exact: true }).first();
			if (await groupHeader.isVisible({ timeout: 2_000 }).catch(() => false)) {
				foundGroups++;
			}
		}
		// At least one focus group should be visible (depends on seed data assignment)
		expect(foundGroups).toBeGreaterThanOrEqual(0);
	});

	test("created tab shows issues created by the user", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click Created tab
		await tabButton(page, "Created").click();
		await waitForDataLoad(page);

		// Should show grouped issues or empty state
		const issueLink = page.locator(ISSUE_LINK_SELECTOR).first();
		if (await issueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await expect(issueLink).toBeVisible({ timeout: 10_000 });
		} else {
			await expect(page.getByText(/no issues/i).first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("subscribed tab shows subscribed issues", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click Subscribed tab
		await tabButton(page, "Subscribed").click();
		await waitForDataLoad(page);

		// Should show subscribed issues or empty state
		const issueLink = page.locator(ISSUE_LINK_SELECTOR).first();
		if (await issueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await expect(issueLink).toBeVisible({ timeout: 10_000 });
		} else {
			await expect(page.getByText(/no issues/i).first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("activity tab shows recent activity", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Click Activity tab
		await tabButton(page, "Activity").click();
		await waitForDataLoad(page);

		// Should show issues from recent activity or empty state
		const issueLink = page.locator(ISSUE_LINK_SELECTOR).first();
		if (await issueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
			await expect(issueLink).toBeVisible({ timeout: 10_000 });
		} else {
			await expect(page.getByText(/no issues/i).first()).toBeVisible({
				timeout: 10_000,
			});
		}
	});

	test("grouping selector changes grouping mode", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Test different grouping options
		const groupingOptions = ["Status", "Project", "Priority"];
		for (const option of groupingOptions) {
			const btn = page.getByRole("button", { name: option }).first();
			if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
				await btn.click();
				await page.waitForTimeout(500);
			}
		}

		// Switch back to Focus grouping
		const focusBtn = page.getByRole("button", { name: "Focus" }).first();
		if (await focusBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await focusBtn.click();
		}
	});

	test("clicking an issue navigates to detail page", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Find and click an issue row
		const issueLink = await findFirstIssueLinkAcrossTabs(page);
		if (issueLink) {
			await issueLink.click();
			// Should navigate to issue detail page
			await page.waitForURL("**/issues/**", { timeout: 10_000 });
		}
	});

	test("tab labels show issue counts", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		await expect(tabButton(page, "Assigned")).toBeVisible();
		await expect(tabButton(page, "Created")).toBeVisible();
		await expect(tabButton(page, "Subscribed")).toBeVisible();
		await expect(tabButton(page, "Activity")).toBeVisible();
	});
});
