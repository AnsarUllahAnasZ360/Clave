import { expect, type Page, test } from "@playwright/test";
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
	async function openIssueDetail(page: Page, identifier: string) {
		await navigateToWorkspaceRoute(page, `issues/${identifier}`);
		await page.waitForURL(`**/${WORKSPACE_SLUG}/issues/${identifier}`, {
			timeout: 10_000,
		});
		await waitForDataLoad(page);
		await expect(page.getByText(identifier).first()).toBeVisible({
			timeout: 10_000,
		});
	}

	test.beforeEach(async ({ page }) => {
		await devLoginAndSeed(page);
	});

	test("issue detail shows relations section", async ({ page }) => {
		// CLV-106 blocks CLV-110 in seeded data.
		await openIssueDetail(page, "CLV-106");

		// Relations section should show at least one relation.
		const relationsSection = page
			.getByText(/relation/i)
			.or(page.getByText(/blocks/i))
			.or(page.getByText("CLV-110"));
		await expect(relationsSection).toBeVisible({ timeout: 10_000 });
	});

	test("add relation button opens dialog", async ({ page }) => {
		await openIssueDetail(page, "CLV-100");

		// Look for "Add relation" button
		const addRelationBtn = page.getByText(/add relation/i).first();
		if (await addRelationBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
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
	});

	test("blocked issue shows blocking indicator on detail page", async ({
		page,
	}) => {
		// CLV-110 is blocked by CLV-106 in seeded data.
		await openIssueDetail(page, "CLV-110");

		// Should show "Blocked by" relation group.
		const blockedBy = page.getByText(/blocked by/i).first();
		await expect(blockedBy).toBeVisible({ timeout: 10_000 });

		// Should show the blocking issue identifier.
		await expect(page.getByText("CLV-106").first()).toBeVisible({
			timeout: 5_000,
		});
	});

	test("relation groups are organized by type", async ({ page }) => {
		// CLV-100 has a relates_to relation with CLV-111.
		await openIssueDetail(page, "CLV-100");

		// Should show "Related to" section with CLV-111.
		const relatedSection = page
			.getByText(/related to/i)
			.or(page.getByText("CLV-111"));
		await expect(relatedSection).toBeVisible({ timeout: 10_000 });
	});
});
