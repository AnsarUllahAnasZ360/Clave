"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "../../../../convex/_generated/api";

export default function OnboardingPage() {
	const router = useRouter();
	const user = useQuery(api.users.current);
	const workspaces = useQuery(api.workspaces.list);
	const createDemo = useMutation(api.demo.queries.createDemoWorkspaceForUser);
	const creatingRef = useRef(false);

	// If user already has workspaces, redirect immediately
	useEffect(() => {
		if (workspaces === undefined || user === undefined) return;

		if (workspaces.length > 0) {
			router.replace(`/${workspaces[0].slug}/chat`);
			return;
		}

		// No workspaces — auto-create a demo workspace
		if (creatingRef.current) return;
		creatingRef.current = true;

		createDemo({})
			.then(({ slug }) => {
				router.replace(`/${slug}/chat`);
			})
			.catch((err) => {
				console.error("Failed to create demo workspace:", err);
				creatingRef.current = false;
			});
	}, [workspaces, user, router, createDemo]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-md space-y-6 px-4 text-center">
				<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sienna-600 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
					<span className="text-lg font-bold">C</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Welcome to Clave
				</h1>
				<p className="text-sm text-muted-foreground">
					Setting up your demo workspace...
				</p>
				<div className="animate-pulse text-muted-foreground text-sm">
					Loading...
				</div>
			</div>
		</div>
	);
}
