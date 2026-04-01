import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { type Value, v } from "convex/values";
import { query } from "./_generated/server";
import { getEmailAuthProviderCapabilities } from "./auth/featureFlags";
import { PlunkOTP, PlunkOTPPasswordReset } from "./auth/PlunkOTP";

const emailAuthProviderCapabilities = getEmailAuthProviderCapabilities();

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Google,
		Password({
			profile(params: Record<string, Value | undefined>) {
				return {
					email: params.email as string,
					name: (params.name as string) || "",
				};
			},
			...(emailAuthProviderCapabilities.passwordResetEnabled
				? { reset: PlunkOTPPasswordReset }
				: {}),
			...(emailAuthProviderCapabilities.emailVerificationEnabled
				? { verify: PlunkOTP }
				: {}),
		}),
	],
	session: {
		totalDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
		inactiveDurationMs: 1000 * 60 * 60 * 24 * 7, // 7 days
	},
	jwt: {
		durationMs: 60 * 60 * 1000, // 1 hour
	},
});

export const getEmailAuthCapabilities = query({
	args: {},
	returns: v.object({
		passwordResetEnabled: v.boolean(),
		emailVerificationEnabled: v.boolean(),
	}),
	handler: async () => {
		return getEmailAuthProviderCapabilities();
	},
});
