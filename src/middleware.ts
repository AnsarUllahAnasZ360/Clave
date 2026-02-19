import {
	convexAuthNextjsMiddleware,
	isAuthenticatedNextjs,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware(async (request) => {
	const pathname = request.nextUrl.pathname;

	// Public routes that don't require auth
	const isPublicRoute =
		pathname === "/" ||
		pathname === "/sign-in" ||
		pathname === "/dev-login" ||
		pathname.startsWith("/brand") ||
		pathname.startsWith("/test-primitives") ||
		pathname.startsWith("/api/") ||
		pathname.startsWith("/docs") ||
		pathname.startsWith("/share") ||
		pathname.startsWith("/join");

	if (isPublicRoute) {
		return;
	}

	// Redirect unauthenticated users to sign-in
	if (!(await isAuthenticatedNextjs())) {
		return nextjsMiddlewareRedirect(request, "/sign-in");
	}
});

export const config = {
	matcher: ["/((?!.*\\..*|_next).*)"],
};
