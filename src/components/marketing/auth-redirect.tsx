"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

/**
 * Redirects authenticated users to their workspace.
 * Renders nothing — purely a side-effect component.
 */
export function AuthRedirect() {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const workspaces = useQuery(api.workspaces.list, user ? {} : "skip");

	useEffect(() => {
		if (user === undefined || workspaces === undefined) {
			return; // Still loading
		}

		if (user === null) {
			return; // Not authenticated — show landing page
		}

		if (workspaces.length > 0) {
			router.replace(`/${workspaces[0].slug}/projects`);
		} else {
			router.replace("/onboarding" as never);
		}
	}, [user, workspaces, router]);

	return null;
}
