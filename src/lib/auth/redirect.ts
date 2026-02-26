export const DEFAULT_POST_LOGIN_REDIRECT = "/auth/callback";

const INTERNAL_REDIRECT_ORIGIN = "https://internal.clave";

/**
 * Allow only in-app relative redirects to prevent open redirect abuse.
 */
export function sanitizeInternalRedirect(
	redirect: string | null | undefined,
	fallback = DEFAULT_POST_LOGIN_REDIRECT,
): string {
	if (!redirect) return fallback;

	const value = redirect.trim();
	if (!value.startsWith("/")) return fallback;

	try {
		const parsed = new URL(value, INTERNAL_REDIRECT_ORIGIN);
		if (parsed.origin !== INTERNAL_REDIRECT_ORIGIN) return fallback;

		// Prevent auth callback loops and dead-end auth-to-auth redirects.
		if (
			parsed.pathname === "/auth/callback" ||
			parsed.pathname === "/sign-in" ||
			parsed.pathname === "/sign-up"
		) {
			return fallback;
		}

		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return fallback;
	}
}

export function buildAuthCallbackRedirect(
	redirect: string | null | undefined,
): string {
	const safeRedirect = sanitizeInternalRedirect(redirect, "");
	if (!safeRedirect) return DEFAULT_POST_LOGIN_REDIRECT;
	return `${DEFAULT_POST_LOGIN_REDIRECT}?redirect=${encodeURIComponent(safeRedirect)}`;
}
