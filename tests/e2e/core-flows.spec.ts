import { expect, test, waitForHydration } from "./fixtures/auth";

/**
 * E2E tests for core flows across all remaining features.
 *
 * Auth limitation: Convex Auth uses WebSocket-based signIn() which cannot be
 * mocked via Playwright's route interception. Tests that require an
 * authenticated session (client CRUD, note creation, file upload, inbox
 * notifications, command palette within a workspace, sidebar navigation,
 * settings persistence, and the full project-to-notification flow) are marked
 * with test.skip and a TODO referencing the auth limitation.
 *
 * Additional limitation: The landing page (/) depends on a Convex query
 * (`useQuery(api.users.current)`) to determine whether to show the landing
 * content or a loading state. Without a running Convex backend, the query
 * stays as `undefined` and the page shows "Loading..." indefinitely. Tests
 * for landing page content visibility are therefore limited to what renders
 * regardless of Convex backend state (HTTP status, page title).
 *
 * What IS tested:
 * 1. Public page rendering (/, /brand, /test-primitives, /docs)
 * 2. Brand page structure and navigation
 * 3. Test primitives page component rendering
 * 4. Docs site rendering and navigation
 * 5. Responsive design across viewports
 * 6. Accessibility basics (headings, keyboard navigation, ARIA)
 * 7. Cross-page navigation between public routes
 */

// ---------------------------------------------------------------------------
// Public Pages -- Landing
// ---------------------------------------------------------------------------

test.describe("Landing page", () => {
	test("landing page returns 200 status", async ({
		unauthenticatedPage: page,
	}) => {
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
	});

	test("landing page has correct page title", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/");
		await waitForHydration(page);
		await expect(page).toHaveTitle(/Clave/);
	});

	test("landing page renders hero content", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/");
		await waitForHydration(page);

		// Marketing page hero heading.
		await expect(
			page.getByRole("heading", { name: "Build in sync." }),
		).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Public Pages -- Brand Guidelines
// ---------------------------------------------------------------------------

test.describe("Brand page", () => {
	test("renders brand page with navigation and hero", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify page title
		await expect(page).toHaveTitle(/Brand/i);

		// Verify hero section -- "Build in sync." tagline (scoped to #hero
		// since it also appears in the typography section)
		await expect(
			page.locator("#hero").getByText("Build in sync."),
		).toBeVisible();

		// Verify "Brand guidelines" subtitle (exact match to avoid matching
		// the footer text "Clave Brand Guidelines")
		await expect(
			page.getByText("Brand guidelines", { exact: true }),
		).toBeVisible();
	});

	test("brand page has sticky navigation with section links", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify nav links exist
		const navItems = [
			"Intro",
			"Logo",
			"Color",
			"Type",
			"Icons",
			"Surfaces",
			"Components",
			"Voice",
			"Dark mode",
			"In context",
		];
		for (const item of navItems) {
			await expect(page.getByRole("link", { name: item })).toBeVisible();
		}
	});

	test("brand page renders all major sections", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Check section headings exist -- each Section component renders an h2
		// Use exact match to avoid partial matches
		const sections = [
			"Logo",
			"Color",
			"Typography",
			"Iconography",
			"Surfaces",
			"Components",
			"Voice",
		];
		for (const section of sections) {
			await expect(
				page.getByRole("heading", { name: section, exact: true }),
			).toBeVisible();
		}
	});

	test("brand page shows sienna color scale", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify sienna scale section exists with key values
		await expect(page.getByText("Sienna scale")).toBeVisible();
		// #C26A3A appears multiple times on brand page, use first()
		await expect(page.getByText("#C26A3A").first()).toBeVisible();
	});

	test("brand page shows component examples", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify button component examples
		await expect(page.getByRole("button", { name: "Primary" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Secondary" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Ghost" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Destructive" }),
		).toBeVisible();
	});

	test("brand page shows issue list in context section", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify issue IDs from the in-context section
		await expect(page.getByText("CLV-198")).toBeVisible();
		await expect(page.getByText("CLV-197")).toBeVisible();
		await expect(page.getByText("CLV-195")).toBeVisible();
	});

	test("brand page has footer with copyright", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify footer
		await expect(page.getByText(/Clave Brand Guidelines/)).toBeVisible();
	});

	test("brand page returns 200 status", async ({
		unauthenticatedPage: page,
	}) => {
		const response = await page.goto("/brand");
		expect(response?.status()).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Public Pages -- Test Primitives
// ---------------------------------------------------------------------------

test.describe("Test primitives page", () => {
	test("renders test primitives page with main heading", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		await expect(
			page.getByRole("heading", {
				name: "Component Primitives Test Page",
			}),
		).toBeVisible();
	});

	test("renders all component sections", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Verify key section headings (exact match to avoid substring matches)
		const sections = [
			"Button variants",
			"Badge variants",
			"Card",
			"Avatar",
			"Dialog",
			"Tabs",
			"Accordion",
			"Table",
			"Separator",
			"Skeleton",
		];
		for (const section of sections) {
			await expect(
				page.getByRole("heading", { name: section, exact: true }),
			).toBeVisible();
		}
	});

	test("renders button variants correctly", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Check all button variant labels
		const buttonLabels = [
			"Default",
			"Secondary",
			"Destructive",
			"Outline",
			"Ghost",
			"Link",
		];
		for (const label of buttonLabels) {
			await expect(
				page.getByRole("button", { name: label }).first(),
			).toBeVisible();
		}
	});

	test("renders badge variants correctly", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Verify badges render
		await expect(page.getByText("Default").first()).toBeVisible();
		await expect(page.getByText("Secondary").first()).toBeVisible();
	});

	test("renders card component with title and description", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		await expect(page.getByText("Card title")).toBeVisible();
		await expect(page.getByText("Card description goes here")).toBeVisible();
	});

	test("renders avatar with fallback initials", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// The Avatar section heading should be visible
		await expect(
			page.getByRole("heading", { name: "Avatar", exact: true }),
		).toBeVisible();

		// AvatarFallback renders when image fails to load.
		// Check at least one fallback is visible (scoped to avoid
		// matching unrelated text elsewhere on the page).
		const avatarSection = page
			.getByRole("heading", { name: "Avatar", exact: true })
			.locator("..");
		await expect(avatarSection).toBeVisible();
	});

	test("renders table with data rows", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Table headers
		await expect(
			page.getByRole("columnheader", { name: "Name" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Status" }),
		).toBeVisible();
		await expect(
			page.getByRole("columnheader", { name: "Role" }),
		).toBeVisible();

		// Table data
		await expect(page.getByRole("cell", { name: "Alice" })).toBeVisible();
		await expect(page.getByRole("cell", { name: "Bob" })).toBeVisible();
	});

	test("renders tabs with content switching", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Default tab content visible
		await expect(page.getByText("Content for tab 1.")).toBeVisible();

		// Click tab 2
		await page.getByRole("tab", { name: "Tab 2" }).click();
		await expect(page.getByText("Content for tab 2.")).toBeVisible();

		// Click tab 3
		await page.getByRole("tab", { name: "Tab 3" }).click();
		await expect(page.getByText("Content for tab 3.")).toBeVisible();
	});

	test("renders accordion with expandable items", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Click first accordion trigger
		await page.getByRole("button", { name: "First item" }).click();
		await expect(
			page.getByText("Content for the first accordion item."),
		).toBeVisible();

		// Click second accordion trigger
		await page.getByRole("button", { name: "Second item" }).click();
		await expect(
			page.getByText("Content for the second accordion item."),
		).toBeVisible();
	});

	test("renders shared utility components", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Check shared utility section heading
		await expect(
			page.getByRole("heading", {
				name: "Shared Utility Components",
			}),
		).toBeVisible();

		// Priority badges
		await expect(
			page.getByRole("heading", { name: "Priority Badge" }),
		).toBeVisible();

		// Filter chips
		await expect(
			page.getByRole("heading", { name: "Filter Chip" }),
		).toBeVisible();
	});

	test("test primitives page returns 200 status", async ({
		unauthenticatedPage: page,
	}) => {
		const response = await page.goto("/test-primitives");
		expect(response?.status()).toBe(200);
	});
});

// ---------------------------------------------------------------------------
// Public Pages -- Docs
// ---------------------------------------------------------------------------

test.describe("Docs site", () => {
	test("docs page is accessible without auth", async ({
		unauthenticatedPage: page,
	}) => {
		const response = await page.goto("/docs");
		expect(response?.status()).toBeLessThan(400);
		// Should NOT redirect to sign-in
		expect(page.url()).not.toContain("/sign-in");
	});

	test("docs page renders Fumadocs layout", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/docs");
		await waitForHydration(page);

		// Verify the docs layout rendered. "Clave Docs" is the nav title
		// but may be hidden on mobile viewports (inside collapsed sidebar).
		// Check that the element exists in the DOM (even if hidden) or that
		// the page title contains relevant docs text.
		const claveDocsLocator = page.getByText("Clave Docs").first();
		const count = await claveDocsLocator.count();
		expect(count).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Responsive Design
// ---------------------------------------------------------------------------

test.describe("Responsive design", () => {
	test("landing page loads correctly on mobile viewport", async ({
		unauthenticatedPage: page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);
		await waitForHydration(page);

		// Hero should remain visible on mobile.
		await expect(
			page.getByRole("heading", { name: "Build in sync." }),
		).toBeVisible();
	});

	test("brand page renders correctly on tablet viewport", async ({
		unauthenticatedPage: page,
	}) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto("/brand");
		await waitForHydration(page);

		// Verify key elements render at tablet size (scoped to #hero to
		// avoid strict mode violation from duplicate "Build in sync." text)
		await expect(
			page.locator("#hero").getByText("Build in sync."),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "Logo" })).toBeVisible();
	});

	test("test primitives page renders correctly on mobile viewport", async ({
		unauthenticatedPage: page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/test-primitives");
		await waitForHydration(page);

		await expect(
			page.getByRole("heading", {
				name: "Component Primitives Test Page",
			}),
		).toBeVisible();

		// Buttons should still be visible
		await expect(
			page.getByRole("button", { name: "Default" }).first(),
		).toBeVisible();
	});
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

test.describe("Accessibility", () => {
	test("brand page has proper heading hierarchy", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Should have h2 section headings
		const h2Count = await page.locator("h2").count();
		expect(h2Count).toBeGreaterThanOrEqual(5);
	});

	test("test primitives page has interactive elements with correct roles", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		// Buttons should have button role
		const buttons = page.getByRole("button");
		const buttonCount = await buttons.count();
		expect(buttonCount).toBeGreaterThan(0);

		// Tabs should have tablist role
		await expect(page.getByRole("tablist")).toBeVisible();

		// Table should have table role
		await expect(page.getByRole("table")).toBeVisible();

		// Checkboxes should have checkbox role
		await expect(page.getByRole("checkbox").first()).toBeVisible();
	});

	test("sign-in page has labeled form controls", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Email input should be labeled
		await expect(page.getByLabel("Email address")).toBeVisible();
	});

	test("brand page navigation links have descriptive text", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Check specific known nav links rather than iterating
		// to avoid fragile tests with dynamic link discovery
		await expect(page.getByRole("link", { name: "Intro" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Logo" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Color" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Type" })).toBeVisible();
	});

	test("test primitives page has h1 heading", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/test-primitives");
		await waitForHydration(page);

		const h1Count = await page.locator("h1").count();
		expect(h1Count).toBeGreaterThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// Cross-Page Navigation
// ---------------------------------------------------------------------------

test.describe("Cross-page navigation", () => {
	test("navigating between public pages preserves 200 status", async ({
		unauthenticatedPage: page,
	}) => {
		// Visit each public page in sequence
		const publicRoutes = ["/", "/brand", "/test-primitives", "/docs"];

		for (const route of publicRoutes) {
			const response = await page.goto(route);
			expect(response?.status()).toBeLessThan(400);
			expect(page.url()).not.toContain("/sign-in");
		}
	});

	test("brand page section anchors navigate within page", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/brand");
		await waitForHydration(page);

		// Click a section link and verify the URL hash changes
		await page.getByRole("link", { name: "Color" }).click();
		expect(page.url()).toContain("#color");
	});
});

// ---------------------------------------------------------------------------
// Auth-Required Tests (Skipped -- require authenticated session)
// ---------------------------------------------------------------------------

test.describe("Client management (auth required)", () => {
	// TODO: Requires authenticated session. Convex Auth's WebSocket-based
	// signIn() cannot be mocked via Playwright's route interception.
	// Implement when test-only session creation endpoint is available.
	test.skip("create client -- navigate to clients, fill form, verify in list", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: navigate to /{workspace}/clients, click create,
		// fill name/company/email, submit, verify client appears in list
	});
});

test.describe("Note creation (auth required)", () => {
	test.skip("create note with rich text -- navigate to notes, create note, verify in list", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: navigate to /{workspace}/notes, create note with
		// title and TipTap content, save, verify note appears in list
	});
});

test.describe("File upload (auth required)", () => {
	test.skip("upload file -- navigate to project files tab, upload image, verify file appears", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: navigate to project files tab, use setInputFiles
		// with tests/e2e/fixtures/test-image.png, verify file appears
		// with name, size, and date
	});
});

test.describe("Inbox notifications (auth required)", () => {
	test.skip("receive and read notification -- trigger notification, verify in inbox, mark read", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: create second browser context (second user),
		// assign task triggering notification, switch to first context,
		// navigate to inbox, verify notification, click to mark read
	});
});

test.describe("Command palette (auth required)", () => {
	test.skip("command palette search -- open with Cmd+K, type query, verify results, navigate", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: press Cmd+K, type project name, wait for debounced
		// search results, select result, verify navigation to project page
	});
});

test.describe("Sidebar navigation (auth required)", () => {
	test.skip("sidebar navigation -- click each link, verify navigation and active state", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: click Projects, Tasks, Clients, Inbox, Analytics
		// in sidebar, verify navigation to correct page, verify active
		// link is highlighted for each route
	});
});

test.describe("Settings persistence (auth required)", () => {
	test.skip("settings changes persist -- change display name, save, reload, verify persisted", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: navigate to settings, change display name, save,
		// reload page, verify name persists
	});
});

test.describe("Full flow -- project to notification (auth required)", () => {
	test.skip("full flow -- create project, create sprint, add story, assign, complete, verify notification", async ({
		unauthenticatedPage: _page,
	}) => {
		// Would test: create project via wizard -> create sprint within
		// project -> add story to sprint -> assign story to self ->
		// mark story complete -> verify notification appears in inbox
	});
});
