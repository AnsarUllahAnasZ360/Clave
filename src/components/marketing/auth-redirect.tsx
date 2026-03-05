"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Redirects authenticated users to their workspace or onboarding.
 * Renders nothing — purely a side-effect component.
 */
export function AuthRedirect() {
	const router = useRouter();
	const pathname = usePathname();
	const bootState = useQuery(api.users.resolvePostLoginState);
	const destination = bootState?.destination;
	const destinationPath = destination?.path;

	useEffect(() => {
		if (bootState === undefined || destination === undefined) {
			return; // Still loading
		}

		if (!bootState.isAuthenticated || destination === null) {
			return; // Not authenticated — show landing page
		}

		if (destinationPath === pathname) {
			return;
		}

		router.replace(destinationPath as never);
	}, [
		bootState?.isAuthenticated,
		destinationPath,
		pathname,
		router,
		bootState,
		destination,
	]);

	return null;
}
