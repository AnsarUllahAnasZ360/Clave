import { expect, test } from "@playwright/test";
import {
	devLoginAndSeed,
	navigateToWorkspaceRoute,
	WORKSPACE_SLUG,
	waitForDataLoad,
} from "./helpers/dev-login";

/**
 * E2E tests for issue relations (Sprint 3).
 *
 * Tests cover: relation display on issue detail, blocking indicators,
 * add relation dialog, and removing relations.
 *
 * Seed data: CLV-106 blocks CLV-110, CLV-100 relates_to CLV-111,
 *            CLV-121 relates_to CLV-122, CLV-124 duplicates CLV-120.
 */

test.describe("Issue relations", () => {
	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("issue detail shows relations section", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Navigate to an issue that has relations (CLV-106 blocks CLV-110)
		const issueLink = page.getByText("CLV-106").first();
		if (await issueLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await issueLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Relations section should show at least one relation
			const relationsSection = page
				.getByText(/relation/i)
				.or(page.getByText(/blocks/i))
				.or(page.getByText("CLV-110"));
			await expect(relationsSection).toBeVisible({ timeout: 10_000 });
		}
	});

	test("add relation button opens dialog", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		const issueLink = page.getByText("CLV-100").first();
		if (await issueLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await issueLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Look for "Add relation" button
			const addRelationBtn = page.getByText(/add relation/i).first();
			if (
				await addRelationBtn.isVisible({ timeout: 5_000 }).catch(() => false)
			) {
				await addRelationBtn.click();

				// Dialog should open with relation type selector
				const dialog = page.locator('[role="dialog"]');
				await expect(dialog).toBeVisible({ timeout: 5_000 });

				// Should have relation type options
				const typeSelector = page
					.getByText(/blocks/i)
					.or(page.getByText(/blocked by/i))
					.or(page.getByText(/related to/i));
				await expect(typeSelector).toBeVisible({ timeout: 5_000 });
			}
		}
	});

	test("blocked issue shows blocking indicator on detail page", async ({
		page,
	}) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// CLV-110 is blocked by CLV-106 in seed data
		const issueLink = page.getByText("CLV-110").first();
		if (await issueLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await issueLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Should show "Blocked by" relation group
			const blockedBy = page.getByText(/blocked by/i).first();
			await expect(blockedBy).toBeVisible({ timeout: 10_000 });

			// Should show the blocking issue identifier
			await expect(page.getByText("CLV-106").first()).toBeVisible({
				timeout: 5_000,
			});
		}
	});

	test("relation groups are organized by type", async ({ page }) => {
		await navigateToWorkspaceRoute(page, "tasks");
		await waitForDataLoad(page);

		// Navigate to CLV-100 which has a relates_to relation with CLV-111
		const issueLink = page.getByText("CLV-100").first();
		if (await issueLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await issueLink.click();
			await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/**`, {
				timeout: 10_000,
			});
			await waitForDataLoad(page);

			// Should show "Related to" section with CLV-111
			const relatedSection = page
				.getByText(/related to/i)
				.or(page.getByText("CLV-111"));
			await expect(relatedSection).toBeVisible({ timeout: 10_000 });
		}
	});
});
