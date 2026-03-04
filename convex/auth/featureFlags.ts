export type EmailAuthProviderCapabilities = {
	passwordResetEnabled: boolean;
	emailVerificationEnabled: boolean;
};

type AuthEnv = Record<string, string | undefined>;

function hasConfiguredValue(value: string | undefined) {
	return typeof value === "string" && value.trim().length > 0;
}

export function getEmailAuthProviderCapabilities(
	env: AuthEnv = process.env,
): EmailAuthProviderCapabilities {
	const resendConfigured = hasConfiguredValue(env.AUTH_RESEND_KEY);
	const isDevDeployment =
		env.CONVEX_DEPLOYMENT?.startsWith("dev:") ||
		env.AUTH_SKIP_EMAIL_VERIFICATION === "true";
	return {
		passwordResetEnabled: resendConfigured,
		emailVerificationEnabled: resendConfigured && !isDevDeployment,
	};
}
