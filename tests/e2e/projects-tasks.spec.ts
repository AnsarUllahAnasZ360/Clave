import { expect, type Page, test, waitForHydration } from "./fixtures/auth";

/**
 * E2E tests for Projects and Tasks pages.
 *
 * Auth limitation: Convex Auth uses WebSocket-based signIn() which cannot be
 * mocked via Playwright's route interception. Tests focus on:
 * 1. Route protection (unauthenticated redirects to /sign-in)
 * 2. URL structure and navigation patterns
 * 3. Sign-in page integrity after redirect from protected routes
 *
 * For future authenticated tests, a test-only Convex endpoint for session
 * creation (guarded by NODE_ENV === "test") would enable full CRUD testing
 * of project creation (wizard + quick create), Kanban drag-and-drop, task
 * assignment, status changes, and sub-issues.
 */

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** Navigate to the projects page and wait for redirect to complete. */
async function navigateToProjects(page: Page, workspaceSlug: string) {
	await page.goto(`/${workspaceSlug}/projects`);
	await page.waitForURL("**/sign-in**", { timeout: 10_000 });
}

/** Navigate to a specific project detail page and wait for redirect. */
async function navigateToProject(
	page: Page,
	workspaceSlug: string,
	projectSlug: string,
) {
	await page.goto(`/${workspaceSlug}/projects/${projectSlug}`);
	await page.waitForURL("**/sign-in**", { timeout: 10_000 });
}

/** Navigate to the tasks page and wait for redirect to complete. */
async function navigateToTasks(page: Page, workspaceSlug: string) {
	await page.goto(`/${workspaceSlug}/tasks`);
	await page.waitForURL("**/sign-in**", { timeout: 10_000 });
}

/** Navigate to a project's backlog page and wait for redirect. */
async function navigateToBacklog(
	page: Page,
	workspaceSlug: string,
	projectSlug: string,
) {
	await page.goto(`/${workspaceSlug}/projects/${projectSlug}/backlog`);
	await page.waitForURL("**/sign-in**", { timeout: 10_000 });
}

/** Assert the sign-in page loaded correctly after a redirect. */
async function assertSignInPage(page: Page) {
	await waitForHydration(page);
	await expect(
		page.getByRole("heading", { name: "Sign in to Clave" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Continue with Google/i }),
	).toBeVisible();
}

// ---------------------------------------------------------------------------
// Route Protection Tests -- Projects
// ---------------------------------------------------------------------------

test.describe("Projects route protection", () => {
	test("redirects to sign-in when accessing projects page unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToProjects(page, "test-workspace");
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing project detail unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToProject(page, "test-workspace", "my-project");
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing project backlog unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToBacklog(page, "test-workspace", "my-project");
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in for projects page with any workspace slug", async ({
		unauthenticatedPage: page,
	}) => {
		// Verify middleware catches all workspace slugs, not just specific ones
		for (const slug of ["acme-corp", "my-team", "dev-workspace"]) {
			await navigateToProjects(page, slug);
			expect(page.url()).toContain("/sign-in");
		}
	});
});

// ---------------------------------------------------------------------------
// Route Protection Tests -- Tasks
// ---------------------------------------------------------------------------

test.describe("Tasks route protection", () => {
	test("redirects to sign-in when accessing tasks page unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToTasks(page, "test-workspace");
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in for tasks page with any workspace slug", async ({
		unauthenticatedPage: page,
	}) => {
		for (const slug of ["acme-corp", "my-team", "dev-workspace"]) {
			await navigateToTasks(page, slug);
			expect(page.url()).toContain("/sign-in");
		}
	});
});

// ---------------------------------------------------------------------------
// Route Protection Tests -- Related workspace routes
// ---------------------------------------------------------------------------

test.describe("Related workspace route protection", () => {
	test("redirects to sign-in when accessing analytics unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/analytics");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing clients unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/clients");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing settings unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/settings");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing inbox unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/inbox");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing notes unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/notes");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing files unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-workspace/files");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});
});

// ---------------------------------------------------------------------------
// Sign-in page integrity after redirect
// ---------------------------------------------------------------------------

test.describe("Sign-in page after redirect", () => {
	test("sign-in page renders correctly after projects redirect", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToProjects(page, "test-workspace");
		await assertSignInPage(page);
		await expect(page.getByLabel("Email address")).toBeVisible();
	});

	test("sign-in page renders correctly after tasks redirect", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToTasks(page, "test-workspace");
		await assertSignInPage(page);
	});

	test("sign-in page renders correctly after project detail redirect", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToProject(page, "test-workspace", "some-project");
		await assertSignInPage(page);
	});

	test("sign-in page renders correctly after backlog redirect", async ({
		unauthenticatedPage: page,
	}) => {
		await navigateToBacklog(page, "test-workspace", "my-project");
		await assertSignInPage(page);
	});
});

// ---------------------------------------------------------------------------
// URL Pattern Tests
// ---------------------------------------------------------------------------

test.describe("URL patterns and routing", () => {
	test("all project-related routes redirect when unauthenticated", async ({
		unauthenticatedPage: page,
	}) => {
		// All workspace routes should trigger the middleware redirect,
		// confirming the route structure is recognized by the router
		const routes = [
			"/my-workspace/projects",
			"/my-workspace/tasks",
			"/my-workspace/projects/some-id",
			"/my-workspace/projects/some-id/backlog",
		];

		for (const route of routes) {
			await page.goto(route);
			await page.waitForURL("**/sign-in**", { timeout: 10_000 });
			expect(page.url()).toContain("/sign-in");
		}
	});

	test("docs route is public and does not redirect", async ({
		unauthenticatedPage: page,
	}) => {
		const response = await page.goto("/docs");
		// Docs should be accessible without auth (public route in middleware)
		expect(response?.status()).toBeLessThan(400);
		// Should NOT redirect to sign-in
		expect(page.url()).not.toContain("/sign-in");
	});
});
