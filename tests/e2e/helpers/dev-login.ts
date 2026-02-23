import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for Sprint 3 E2E tests.
 *
 * Auth strategy: navigate to /dev-login, seed data, sign in as a dev user.
 * This bypasses Convex WebSocket auth limitations in Playwright.
 */

/** Dev user profiles matching the dev-login page. */
export const DEV_USERS = {
	kul: { name: "Kul", email: "kul@goclave.app", initials: "K" },
	alex: { name: "Alex Chen", email: "alex@goclave.app", initials: "AC" },
	jordan: {
		name: "Jordan Rivera",
		email: "jordan@goclave.app",
		initials: "JR",
	},
} as const;

export type DevUser = keyof typeof DEV_USERS;

/** Default workspace slug used in seeded data. */
export const WORKSPACE_SLUG = "clave-hq";
/** Default organization slug used in seeded data. */
export const ORG_SLUG = "clave";
/** Combined org/workspace path prefix used by App Router routes. */
export const WORKSPACE_PATH = `${ORG_SLUG}/${WORKSPACE_SLUG}`;

let devDataInitialized = false;

/**
 * Seed the database via the dev-login page.
 * Navigates to /dev-login, clicks "Seed database", waits for success message.
 */
export async function seedDatabase(page: Page) {
	await page.goto("/dev-login");
	await page.waitForLoadState("domcontentloaded");

	// Click "Seed database" button
	const seedButton = page.getByRole("button", { name: "Seed database" });
	await expect(seedButton).toBeVisible({ timeout: 15_000 });
	await seedButton.click();

	// Wait for seed action to finish.
	await expect(seedButton).toBeEnabled({ timeout: 30_000 });
	await page
		.locator("text=/seeded successfully|already exists|skipping/i")
		.first()
		.waitFor({ state: "visible", timeout: 5_000 })
		.catch(() => {
			// Message text can vary; button re-enabled is the primary completion signal.
		});
}

/**
 * Reset the database via the dev-login page.
 * Navigates to /dev-login, clicks "Reset data", waits for success message.
 */
export async function resetDatabase(page: Page) {
	await page.goto("/dev-login");
	await page.waitForLoadState("domcontentloaded");

	const resetButton = page.getByRole("button", { name: "Reset data" });
	await expect(resetButton).toBeVisible({ timeout: 15_000 });
	await resetButton.click();

	// Wait for reset action to finish.
	await expect(resetButton).toBeEnabled({ timeout: 30_000 });
	await page
		.locator("text=/cleared successfully|nothing to clear|clear complete/i")
		.first()
		.waitFor({ state: "visible", timeout: 5_000 })
		.catch(() => {
			// Message text can vary; button re-enabled is the primary completion signal.
		});
}

/**
 * Sign in as a dev user via the dev-login page.
 * Clicks the user card matching the given user name, waits for redirect.
 */
export async function signInAsDevUser(page: Page, user: DevUser = "kul") {
	const userData = DEV_USERS[user];

	await page.goto("/dev-login");
	await page.waitForLoadState("domcontentloaded");

	// Click the user card button containing the user's name
	const userButton = page
		.locator("button")
		.filter({ hasText: userData.name })
		.first();
	await expect(userButton).toBeVisible({ timeout: 15_000 });
	await userButton.click();

	// Wait for redirect to any workspace-scoped page under /:org/:workspace
	await page.waitForURL(`**/${WORKSPACE_PATH}/**`, { timeout: 30_000 });
}

/**
 * Full dev-login flow: seed + sign in.
 * Use this at the start of a test to get an authenticated session with data.
 */
export async function devLoginAndSeed(page: Page, user: DevUser = "kul") {
	if (!devDataInitialized) {
		// Start from a clean deterministic state once per worker process.
		await resetDatabase(page);
		await seedDatabase(page);
		devDataInitialized = true;
	}

	try {
		await signInAsDevUser(page, user);
	} catch {
		// Recover from stale auth/account state by rebuilding dev fixtures once.
		await resetDatabase(page);
		await seedDatabase(page);
		devDataInitialized = true;
		await signInAsDevUser(page, user);
	}
}

/**
 * Navigate to a workspace route.
 */
export async function navigateToWorkspaceRoute(page: Page, path: string) {
	await page.goto(`/${WORKSPACE_PATH}/${path}`);
	await page.waitForLoadState("domcontentloaded");
}

/**
 * Wait for Convex data to load by waiting for loading indicators to disappear.
 */
export async function waitForDataLoad(page: Page, timeout = 15_000) {
	// Wait for any "Loading..." text to disappear
	await page
		.locator("text=Loading...")
		.first()
		.waitFor({ state: "hidden", timeout })
		.catch(() => {
			// May not have a loading indicator at all
		});
}

/**
 * Get a stable issue identifier from the page (e.g., "CLV-100").
 */
export async function getFirstIssueIdentifier(page: Page): Promise<string> {
	const identifier = page.locator("text=/CLV-\\d+/").first();
	await expect(identifier).toBeVisible({ timeout: 10_000 });
	const text = await identifier.textContent();
	const match = text?.match(/CLV-\d+/);
	return match ? match[0] : "";
}
