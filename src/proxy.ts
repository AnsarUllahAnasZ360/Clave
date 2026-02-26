import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";
import { PUBLIC_ROUTES } from "@/lib/auth/public-routes";

const isPublicRoute = createRouteMatcher([...PUBLIC_ROUTES]);

export default convexAuthNextjsMiddleware(
	async (request, { convexAuth }) => {
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
	matcher: ["/((?!api/mcp/excalidraw|.*\\..*|_next).*)"],
};
