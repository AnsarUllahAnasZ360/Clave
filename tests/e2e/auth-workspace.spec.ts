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

		// Verify password sign-in form fields + action
		await expect(page.getByLabel("Email address")).toBeVisible();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /^Sign in$/i }),
		).toBeVisible();

		// Verify separator text between auth methods
		await expect(page.getByText("or continue with email")).toBeVisible();
	});

	test("sign in button stays disabled until email and password are valid", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		const signInButton = page.getByRole("button", {
			name: /^Sign in$/i,
		});
		const emailInput = page.getByLabel("Email address");
		const passwordInput = page.getByLabel("Password");

		// Button should be disabled initially (no email/password)
		await expect(signInButton).toBeDisabled();

		// Enter invalid email (no @ sign)
		await emailInput.fill("invalid");
		await passwordInput.fill("password123");
		await expect(signInButton).toBeDisabled();

		// Enter valid email but too-short password
		await emailInput.fill("test@example.com");
		await passwordInput.fill("12345");
		await expect(signInButton).toBeDisabled();

		// Enter valid credentials shape
		await passwordInput.fill("password123");
		await expect(signInButton).toBeEnabled();
	});

	test("password submit surfaces local invalid-credentials error", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Fill a valid form shape and submit.
		await page.getByLabel("Email address").fill("test@example.com");
		await page.getByLabel("Password").fill("wrong-password");
		await page.getByRole("button", { name: /^Sign in$/i }).click();

		await expect(page.getByText("Invalid email or password.")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("Google OAuth button initiates auth flow or shows local error", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		let sawAuthRequest = false;
		page.on("request", (request) => {
			const url = request.url();
			if (
				url.includes("/api/auth/signin/google") ||
				url.includes("convex.site/api/auth") ||
				url.includes("accounts.google.com")
			) {
				sawAuthRequest = true;
			}
		});

		// Prevent leaving the test page if an external OAuth redirect is attempted.
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

		// Deterministic: in local/dev CI either an auth request is attempted,
		// or the component shows its local Google error message.
		await expect
			.poll(async () => {
				if (sawAuthRequest) return "request";
				const hasError = await page
					.getByText("Failed to sign in with Google. Please try again.")
					.isVisible();
				return hasError ? "error" : "";
			})
			.toMatch(/request|error/);
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
	test("password input accepts keyboard submission via Enter", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		// Enter is handled on password input when the form is valid.
		await page.getByLabel("Email address").fill("enter-test@example.com");
		const passwordInput = page.getByLabel("Password");
		await passwordInput.fill("wrong-password");
		await passwordInput.press("Enter");

		await expect(page.getByText("Invalid email or password.")).toBeVisible({
			timeout: 10_000,
		});
	});

	test("submit button shows invalid-credentials error on failed sign-in", async ({
		unauthenticatedPage: page,
	}) => {
		await page.goto("/sign-in");
		await waitForHydration(page);

		await page.getByLabel("Email address").fill("error@example.com");
		await page.getByLabel("Password").fill("wrong-password");
		await page.getByRole("button", { name: /^Sign in$/i }).click();

		await expect(page.getByText("Invalid email or password.")).toBeVisible({
			timeout: 10_000,
		});
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
