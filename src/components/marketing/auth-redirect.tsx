"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Redirects authenticated users to their workspace or onboarding.
 * Renders nothing — purely a side-effect component.
 */
export function AuthRedirect() {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const destination = useQuery(
		api.users.resolvePostLoginDestination,
		user ? {} : "skip",
	);

	useEffect(() => {
		if (user === undefined || (user !== null && destination === undefined)) {
			return; // Still loading
		}

		if (user === null) {
			return; // Not authenticated — show landing page
		}

		if (!destination) return;
		router.replace(destination.path as never);
	}, [user, destination, router]);

	return null;
}
