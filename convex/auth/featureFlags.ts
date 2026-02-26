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
	return {
		passwordResetEnabled: resendConfigured,
		emailVerificationEnabled: resendConfigured,
	};
}
