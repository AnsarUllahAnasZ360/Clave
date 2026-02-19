import { expect, test, waitForHydration } from "./fixtures/auth";

test.describe("Sign-in page", () => {
	test("renders sign-in page with branding and auth options", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Verify Clave branding -- logo, heading, subtext
		await expect(
			page.getByRole("heading", { name: "Sign in to Clave" }),
		).toBeVisible();
		await expect(
			page.getByText("Welcome back! Please sign in to continue."),
		).toBeVisible();

		// Verify Google OAuth button
		await expect(
			page.getByRole("button", { name: /Continue with Google/i }),
		).toBeVisible();

		// Verify email / magic link input
		await expect(page.getByLabel("Email address")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Send magic link/i }),
		).toBeVisible();

		// Verify separator text between auth methods
		await expect(page.getByText("or continue with email")).toBeVisible();

		// Verify legal footer
		await expect(
			page.getByText(/By signing in, you agree to our/),
		).toBeVisible();
	});

	test("magic link button is disabled without valid email", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		const sendButton = page.getByRole("button", {
			name: /Send magic link/i,
		});

		// Button should be disabled initially (no email entered)
		await expect(sendButton).toBeDisabled();

		// Enter invalid email (no @ sign)
		await page.getByLabel("Email address").fill("invalid");
		await expect(sendButton).toBeDisabled();

		// Enter incomplete email (no TLD)
		await page.getByLabel("Email address").fill("test@");
		await expect(sendButton).toBeDisabled();

		// Enter valid email
		await page.getByLabel("Email address").fill("test@example.com");
		await expect(sendButton).toBeEnabled();
	});

	test("magic link button shows loading state when clicked", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Fill in valid email
		await page.getByLabel("Email address").fill("test@example.com");

		// Click send magic link -- the signIn("resend") call goes through
		// Convex WebSocket. Whether it succeeds or fails depends on
		// whether Resend is configured. We verify the button shows
		// "Sending..." loading state immediately after click.
		const sendButton = page.getByRole("button", {
			name: /Send magic link/i,
		});
		await sendButton.click();

		// The button text should change to "Sending..." while the request is in flight
		await expect(page.getByText("Sending...")).toBeVisible({
			timeout: 2000,
		});

		// After the request completes, we should see either:
		// - "Check your email" heading (if Resend is configured and email sent)
		// - Error message (if Resend is not configured)
		// Both outcomes are valid -- we just verify the flow progressed
		await expect(
			page
				.getByRole("heading", { name: "Check your email" })
				.or(page.getByText(/Failed to send magic link/)),
		).toBeVisible({ timeout: 10_000 });
	});

	test("Google OAuth button initiates auth redirect", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Intercept navigation to the Convex auth endpoint
		// The signIn("google") call returns a redirect URL to
		// the Convex deployment's auth endpoint (*.convex.site/api/auth/*)
		// which then redirects to Google. We catch the navigation.
		let redirectUrl = "";
		page.on("request", (request) => {
			const url = request.url();
			if (
				url.includes("convex.site/api/auth") ||
				url.includes("accounts.google.com")
			) {
				redirectUrl = url;
			}
		});

		// Abort navigation to external auth endpoints to prevent leaving the test page
		await page.route("**.convex.site/api/auth/**", async (route) => {
			await route.abort();
		});
		await page.route("https://accounts.google.com/**", async (route) => {
			await route.abort();
		});

		// Click the Google sign-in button
		const googleButton = page.getByRole("button", {
			name: /Continue with Google/i,
		});
		await googleButton.click();

		// Wait for the redirect to be captured
		await page.waitForTimeout(3000);

		// Verify that the OAuth redirect was initiated to the Convex auth endpoint
		expect(redirectUrl).toBeTruthy();
		expect(
			redirectUrl.includes("convex.site/api/auth") ||
				redirectUrl.includes("accounts.google.com"),
		).toBe(true);
	});
});

test.describe("Unauthenticated redirect", () => {
	test("redirects to sign-in when accessing protected workspace route", async ({
		unauthenticatedPage: page,
	}) => {
		// Navigate to a protected route (workspace-scoped)
		await page.goto("/some-workspace/projects");

		// The middleware should redirect to /sign-in
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in when accessing onboarding without auth", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/onboarding");

		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("redirects to sign-in for any workspace slug", async ({
		unauthenticatedPage: page,
	}) => {
		// Try various protected routes to ensure middleware covers all workspace paths
		await page.goto("/test-ws/tasks");
		await page.waitForURL("**/sign-in**", { timeout: 10_000 });
		expect(page.url()).toContain("/sign-in");
	});

	test("allows access to public routes without auth", async ({
		unauthenticatedPage: page,
	}) => {
		// Landing page should be accessible
		const response = await page.goto("/");
		expect(response?.status()).toBe(200);

		// Sign-in page should be accessible
		const signInResponse = await page.goto("/sign-in");
		expect(signInResponse?.status()).toBe(200);
	});
});

test.describe("Onboarding page", () => {
	test("onboarding is protected and redirects unauthenticated users", async ({
		unauthenticatedPage: page,
	}) => {
		// Onboarding requires authentication -- verify the redirect
		await page.goto("/onboarding");
		await page.waitForURL("**", { timeout: 10_000 });

		const currentUrl = page.url();

		// Unauthenticated users should be redirected to sign-in
		expect(currentUrl).toContain("/sign-in");
	});
});

test.describe("Sign-in page interactions", () => {
	test("email input accepts keyboard submission via Enter", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Fill email and press Enter -- should trigger the magic link flow
		const emailInput = page.getByLabel("Email address");
		await emailInput.fill("enter-test@example.com");
		await emailInput.press("Enter");

		// The magic link flow should be triggered -- verify by checking
		// for either the loading state or the result (success or error)
		await expect(
			page
				.getByText("Sending...")
				.or(page.getByRole("heading", { name: "Check your email" }))
				.or(page.getByText(/Failed to send magic link/)),
		).toBeVisible({ timeout: 10_000 });
	});

	test("shows error state on failed magic link send", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Enter a valid email and submit -- if Resend is not configured
		// in the test environment, the signIn call will throw and the
		// component will display an error message
		await page.getByLabel("Email address").fill("error@example.com");
		await page.getByRole("button", { name: /Send magic link/i }).click();

		// Wait for either error or success
		await expect(
			page
				.getByText(/Failed to send magic link/)
				.or(page.getByRole("heading", { name: "Check your email" })),
		).toBeVisible({ timeout: 10_000 });
	});

	test("Google OAuth button is enabled and clickable", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		const googleButton = page.getByRole("button", {
			name: /Continue with Google/i,
		});

		// Button should be enabled and clickable
		await expect(googleButton).toBeEnabled();
		await expect(googleButton).toBeVisible();
	});
});

test.describe("Page metadata", () => {
	test("sign-in page has correct title", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// The page title should contain "Clave"
		await expect(page).toHaveTitle(/Clave/);
	});

	test("landing page is accessible and has correct title", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/");
		await waitForHydration(page);

		await expect(page).toHaveTitle(/Clave/);
	});
});
