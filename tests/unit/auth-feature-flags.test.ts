import { describe, expect, it } from "vitest";
import { getEmailAuthProviderCapabilities } from "../../convex/auth/featureFlags";

describe("auth feature flags", () => {
	it("enables password reset and email verification when AUTH_RESEND_KEY is set", () => {
		const result = getEmailAuthProviderCapabilities({
			AUTH_RESEND_KEY: "re_test_123",
		});

		expect(result).toEqual({
			passwordResetEnabled: true,
			emailVerificationEnabled: true,
		});
	});

	it("treats whitespace-only AUTH_RESEND_KEY as disabled", () => {
		const result = getEmailAuthProviderCapabilities({
			AUTH_RESEND_KEY: "   ",
		});

		expect(result).toEqual({
			passwordResetEnabled: false,
			emailVerificationEnabled: false,
		});
	});

	it("disables password reset and email verification when AUTH_RESEND_KEY is absent", () => {
		const result = getEmailAuthProviderCapabilities({});

		expect(result).toEqual({
			passwordResetEnabled: false,
			emailVerificationEnabled: false,
		});
	});
});
