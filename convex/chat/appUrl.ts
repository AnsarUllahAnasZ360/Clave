type ChatAppUrlEnv = {
	APP_URL?: string;
	NEXT_PUBLIC_APP_URL?: string;
};

export function normalizeChatAppBaseUrl(rawValue: string | undefined): string {
	const value = rawValue?.trim();
	if (!value) return "";
	const withProtocol =
		value.startsWith("http://") || value.startsWith("https://")
			? value
			: `https://${value}`;
	try {
		const parsed = new URL(withProtocol);
		return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
	} catch {
		return "";
	}
}

export function resolveChatAppBaseUrl(
	env: ChatAppUrlEnv = process.env as ChatAppUrlEnv,
): string {
	return normalizeChatAppBaseUrl(env.NEXT_PUBLIC_APP_URL ?? env.APP_URL);
}
