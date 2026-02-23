"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";

export default function BootPage() {
	const router = useRouter();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const user = useQuery(api.users.current);
	const destination = useQuery(
		api.users.resolvePostLoginDestination,
		user ? {} : "skip",
	);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		if (!isAuthenticated) {
			router.replace("/sign-in");
			return;
		}

		if (user === undefined || destination === undefined) {
			return;
		}

		if (user === null) {
			router.replace("/sign-in");
			return;
		}

		if (!destination) {
			router.replace("/onboarding" as never);
			return;
		}

		router.replace(destination.path as never);
	}, [isAuthenticated, isLoading, user, destination, router]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="text-sm text-muted-foreground">Signing you in...</div>
		</div>
	);
}
