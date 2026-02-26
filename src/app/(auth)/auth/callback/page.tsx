"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { sanitizeInternalRedirect } from "@/lib/auth/redirect";
import { api } from "../../../../../convex/_generated/api";

export default function AuthCallbackPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const bootState = useQuery(api.users.resolvePostLoginState);
	const requestedRedirect = sanitizeInternalRedirect(
		searchParams.get("redirect"),
		"",
	);
	const signInPath = requestedRedirect
		? `/sign-in?redirect=${encodeURIComponent(requestedRedirect)}`
		: "/sign-in";

	useEffect(() => {
		if (bootState === undefined) {
			return;
		}

		if (!bootState.isAuthenticated || bootState.destination === null) {
			router.replace(signInPath as never);
			return;
		}

		const destinationPath = requestedRedirect
			? requestedRedirect
			: sanitizeInternalRedirect(bootState.destination.path, "/");
		router.replace(destinationPath as never);
	}, [bootState, requestedRedirect, router, signInPath]);

	return (
		<div className="flex min-h-[240px] w-full items-center justify-center text-sm text-muted-foreground">
			Completing sign-in...
		</div>
	);
}
