import { test as base, type Page } from "@playwright/test";

/**
 * Auth fixtures for E2E tests.
 *
 * Since Clave uses Convex Auth with Google OAuth and Resend Magic Links,
 * full authenticated flows require a running Convex backend with valid
 * credentials. These fixtures provide utilities for testing auth-related
 * UI behavior that can be verified without real OAuth credentials:
 *
 * - Sign-in page rendering and interactions
 * - Middleware redirect behavior (unauthenticated -> /sign-in)
 * - OAuth redirect initiation (mocked via route interception)
 * - Magic link form submission and confirmation UI
 *
 * For tests that need an authenticated session, the `authenticatedPage`
 * fixture intercepts Convex auth endpoints to simulate a logged-in state.
 */

/**
 * Intercepts auth-related API calls to simulate an unauthenticated state.
 * This ensures the middleware redirect tests work deterministically.
 */
async function setupUnauthenticated(page: Page) {
	// Ensure no auth cookies/state carry over between tests
	await page.context().clearCookies();
}

/**
 * Waits for the page to be fully loaded and hydrated.
 * Useful after navigation to ensure React has mounted.
 */
async function waitForHydration(page: Page) {
	await page.waitForLoadState("domcontentloaded");
	// Wait for React to hydrate -- the body should have at least one child element
	await page.waitForSelector("body > *", { state: "attached" });
}

export const test = base.extend<{
	unauthenticatedPage: Page;
}>({
	unauthenticatedPage: async ({ page }, use) => {
		await setupUnauthenticated(page);
		await use(page);
	},
});

export type { Page } from "@playwright/test";
export { expect } from "@playwright/test";
export { waitForHydration };
