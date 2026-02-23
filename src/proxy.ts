import {
	convexAuthNextjsMiddleware,
	isAuthenticatedNextjs,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";

// Next.js 16 auth middleware path.
// Keep this file only; do NOT add ./src/middleware.ts alongside it.
// If both files exist together, Next.js throws repeated startup errors.
export default convexAuthNextjsMiddleware(async (request) => {
	const pathname = request.nextUrl.pathname;

	// Public routes that don't require auth
	const isPublicRoute =
		pathname === "/" ||
		pathname === "/sign-in" ||
		pathname === "/dev-login" ||
		pathname === "/boot" ||
		pathname.startsWith("/icon") ||
		pathname === "/favicon.ico" ||
		pathname.startsWith("/brand") ||
		pathname.startsWith("/api/") ||
		pathname.startsWith("/docs") ||
		pathname.startsWith("/share") ||
		pathname.startsWith("/join");

	if (isPublicRoute) {
		// Next.js 16 requires middleware to return a Response.
		return NextResponse.next();
	}

	// Redirect unauthenticated users to sign-in
	if (!(await isAuthenticatedNextjs())) {
		return nextjsMiddlewareRedirect(request, "/sign-in");
	}

	return NextResponse.next();
});

export const config = {
	// Skip middleware for the built-in Excalidraw MCP endpoint so MCP HTTP
	// requests bypass auth middleware and hit the route handler directly.
	matcher: ["/((?!api/mcp/excalidraw|.*\\..*|_next).*)"],
};
