import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";
import { validateRequiredEnv } from "@/lib/env";
import { getLegacyWorkspaceRedirectPath } from "@/lib/legacy-workspace-redirect";

// Validate at proxy load — every request enters here, so a missing config
// surfaces immediately on the first request after deploy rather than the
// first authenticated query.
validateRequiredEnv();

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);

export default convexAuthNextjsMiddleware(
	async (request, { convexAuth }) => {
		// Wrap custom proxy logic so a future bug here can never 500 the
		// entire site. Worst-case fallback is "let the request through
		// unchanged" — Next's normal routing then handles it.
		try {
			const redirectPath = getLegacyWorkspaceRedirectPath(
				request.nextUrl.pathname,
			);
			if (redirectPath) {
				const url = request.nextUrl.clone();
				url.pathname = redirectPath;
				return NextResponse.redirect(url, 301);
			}

			if (isPublicRoute(request)) {
				return NextResponse.next();
			}

			if (!(await convexAuth.isAuthenticated())) {
				return nextjsMiddlewareRedirect(request, "/sign-in");
			}

			return NextResponse.next();
		} catch (error) {
			console.error("[proxy] error in middleware logic:", error);
			return NextResponse.next();
		}
	},
	{
		cookieConfig: { maxAge: 60 * 60 * 24 * 30 },
	},
);

export const config = {
	// Exclude API routes that must receive raw OAuth callbacks (no middleware touching the request)
	matcher: ["/((?!api/mcp/excalidraw|api/github/oauth|.*\\..*|_next).*)"],
};
