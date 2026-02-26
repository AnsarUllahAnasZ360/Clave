import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTES } from "../../src/lib/auth/public-routes";

describe("PUBLIC_ROUTES", () => {
	it("does not expose onboarding as a public route", () => {
		expect(PUBLIC_ROUTES).not.toContain("/onboarding");
	});

	it("keeps sign-in and auth callback publicly reachable", () => {
		expect(PUBLIC_ROUTES).toContain("/sign-in");
		expect(PUBLIC_ROUTES).toContain("/sign-up");
		expect(PUBLIC_ROUTES).toContain("/auth/callback");
	});
});
