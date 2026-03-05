const RESERVED_TOP_LEVEL_ROUTES = new Set([
	"admin",
	"api",
	"auth",
	"boot",
	"brand",
	"changelog",
	"dev-login",
	"docs",
	"join",
	"onboarding",
	"organizations",
	"share",
	"sign-in",
	"sign-up",
]);

/**
 * Known workspace sub-routes used to detect stale org-prefixed URLs.
 * Old format: /{orgSlug}/{workspaceSlug}/{route}
 * New format: /{workspaceSlug}/{route}
 */
const WORKSPACE_ROUTES = new Set([
	"analytics",
	"boards",
	"chat",
	"clients",
	"docs",
	"files",
	"inbox",
	"issues",
	"notes",
	"projects",
	"settings",
	"tasks",
]);

export function getLegacyWorkspaceRedirectPath(pathname: string) {
	const segments = pathname.split("/").filter(Boolean);

	if (segments.length < 2 || RESERVED_TOP_LEVEL_ROUTES.has(segments[0])) {
		return null;
	}

	if (segments.length === 2) {
		return `/${segments[1]}/chat`;
	}

	if (WORKSPACE_ROUTES.has(segments[2])) {
		return `/${segments.slice(1).join("/")}`;
	}

	return null;
}
