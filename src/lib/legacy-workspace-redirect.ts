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

	// 2 segments: could be old /{orgSlug}/{workspaceSlug} or new /{workspaceSlug}/{route}
	// If the second segment is a known workspace route, it's already the new format — skip
	if (segments.length === 2) {
		if (WORKSPACE_ROUTES.has(segments[1])) {
			return null;
		}
		return `/${segments[1]}/chat`;
	}

	// 3+ segments: old /{orgSlug}/{workspaceSlug}/{route}
	// Only redirect if the third segment is a workspace route (confirms old format)
	if (WORKSPACE_ROUTES.has(segments[2])) {
		return `/${segments.slice(1).join("/")}`;
	}

	return null;
}
