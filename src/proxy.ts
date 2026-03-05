import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);

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

export default convexAuthNextjsMiddleware(
	async (request, { convexAuth }) => {
		const { pathname } = request.nextUrl;
		const segments = pathname.split("/").filter(Boolean);

		// Redirect old /{orgSlug}/{workspaceSlug}/{route} → /{workspaceSlug}/{route}
		if (segments.length >= 3 && WORKSPACE_ROUTES.has(segments[2])) {
			if (!WORKSPACE_ROUTES.has(segments[1])) {
				const url = request.nextUrl.clone();
				url.pathname = `/${segments.slice(1).join("/")}`;
				return NextResponse.redirect(url, 301);
			}
		}

		if (isPublicRoute(request)) {
			return NextResponse.next();
		}

		if (!(await convexAuth.isAuthenticated())) {
			return nextjsMiddlewareRedirect(request, "/sign-in");
		}

		return NextResponse.next();
	},
	{
		cookieConfig: { maxAge: 60 * 60 * 24 * 30 },
	},
);

export const config = {
	// Exclude API routes that must receive raw OAuth callbacks (no middleware touching the request)
	matcher: ["/((?!api/mcp/excalidraw|api/github/oauth|.*\\..*|_next).*)"],
};
