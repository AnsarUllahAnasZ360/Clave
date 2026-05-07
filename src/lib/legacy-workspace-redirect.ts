const RESERVED_TOP_LEVEL_ROUTES = new Set([
	"admin",
	"api",
	"auth",
	"boot",
	"brand",
	"changelog",
	"dev-login",
	"docs",
	"google-chat",
	"join",
	"onboarding",
	"organizations",
	"share",
	"sign-in",
	"sign-up",
]);

/**
 * Known workspace sub-routes — used as a positive signal that a URL is in the
 * legacy /{orgSlug}/{workspaceSlug}/{route} shape. We only rewrite when this
 * signal is present, so unrelated 2-segment paths (e.g. /google-chat/setup)
 * never get speculatively redirected at a workspace slug they don't match.
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

	if (segments.length < 3 || RESERVED_TOP_LEVEL_ROUTES.has(segments[0])) {
		return null;
	}

	// Only redirect when the third segment is a known workspace route — the
	// signal that confirms /{orgSlug}/{workspaceSlug}/{route} shape. Without
	// this gate, any /A/B path would be assumed legacy and 301'd to /B/chat,
	// permanently breaking new top-level routes that forgot to register in
	// RESERVED_TOP_LEVEL_ROUTES.
	if (WORKSPACE_ROUTES.has(segments[2])) {
		return `/${segments.slice(1).join("/")}`;
	}

	return null;
}
