"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function BootPage() {
	const router = useRouter();
	const pathname = usePathname();
	const { signOut } = useAuthActions();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const bootState = useQuery(api.users.resolvePostLoginState);
	const [didAttemptDevRecovery, setDidAttemptDevRecovery] = useState(false);
	const destination = bootState?.destination;
	const destinationPath = destination?.path;
	const ensureDevWorkspaceMember = useMutation(
		api.devInit.ensureDevWorkspaceMember,
	);

	useEffect(() => {
		if (isLoading || bootState === undefined) {
			return;
		}

		if (!isAuthenticated || !bootState.isAuthenticated) {
			void signOut();
			if (pathname === "/sign-in") {
				return;
			}
			router.replace("/sign-in");
			return;
		}

		// If user is signed in but has no active org/workspace (common after seed resets),
		// repair membership in dev mode and retry boot resolution.
		if (!destination) {
			return;
		}

		if (
			isDevMode &&
			destination.path === "/onboarding" &&
			!didAttemptDevRecovery
		) {
			setDidAttemptDevRecovery(true);
			void (async () => {
				try {
					await ensureDevWorkspaceMember();
					router.replace("/boot");
				} catch {
					router.replace("/onboarding");
				}
			})();
			return;
		}

		if (destination.path === "/onboarding") {
			if (pathname === "/onboarding") {
				return;
			}
			router.replace("/onboarding");
			return;
		}

		if (pathname === destinationPath) {
			return;
		}

		router.replace(destination.path as never);
	}, [
		isAuthenticated,
		isLoading,
		bootState?.isAuthenticated,
		destinationPath,
		destination?.source,
		router,
		signOut,
		ensureDevWorkspaceMember,
		didAttemptDevRecovery,
		pathname,
	]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="text-sm text-muted-foreground">Signing you in...</div>
		</div>
	);
}
