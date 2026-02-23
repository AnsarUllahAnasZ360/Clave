import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { Value } from "convex/values";

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
		}),
	],
	session: {
		totalDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
		inactiveDurationMs: 30 * 24 * 60 * 60 * 1000, // 30 days
	},
	jwt: {
		durationMs: 60 * 60 * 1000, // 1 hour
	},
});
