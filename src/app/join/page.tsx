"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";

function JoinPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
	const joinWithCode = useMutation(api.workspaceMembers.joinWithCode);

	const codeFromUrl = searchParams.get("code") ?? "";
	const [code, setCode] = useState(codeFromUrl.toUpperCase());
	const [joining, setJoining] = useState(false);
	const [error, setError] = useState("");

	// Sync code from URL on mount
	useEffect(() => {
		if (codeFromUrl) {
			setCode(codeFromUrl.toUpperCase());
		}
	}, [codeFromUrl]);

	// Validate the code in real time
	const validation = useQuery(
		api.inviteCodes.validate,
		code.length >= 6 ? { code } : "skip",
	);

	const handleCodeChange = useCallback((value: string) => {
		setCode(
			value
				.replace(/[^a-zA-Z0-9]/g, "")
				.toUpperCase()
				.slice(0, 8),
		);
		setError("");
	}, []);

	const handleJoin = useCallback(async () => {
		if (!code.trim()) {
			setError("Invite code is required");
			return;
		}

		if (!isAuthenticated) {
			// Redirect to sign-in with a return URL back here
			const returnUrl = `/join?code=${encodeURIComponent(code)}`;
			router.push(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
			return;
		}

		setJoining(true);
		setError("");

		try {
			await joinWithCode({ code: code.trim() });
			toast.success("Joined workspace successfully");
			// Redirect to the workspace if we have routing info, otherwise reload
			if (validation?.orgSlug && validation?.workspaceSlug) {
				window.location.href = `/${validation.orgSlug}/${validation.workspaceSlug}`;
			} else {
				window.location.href = "/";
			}
		} catch (e) {
			const message =
				e instanceof Error ? e.message : "Failed to join workspace";
			if (message.includes("plan_limit") || message.includes("limit")) {
				setError(
					"This workspace's organization has reached its member limit. Contact the workspace admin to upgrade their plan.",
				);
			} else {
				setError(message);
			}
		} finally {
			setJoining(false);
		}
	}, [
		code,
		isAuthenticated,
		joinWithCode,
		router,
		validation?.orgSlug,
		validation?.workspaceSlug,
	]);

	const isValid = validation?.valid === true;
	const isInvalid = validation && !validation.valid && code.length >= 6;

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4">
			<div className="w-full max-w-[460px] rounded-3xl border border-border bg-card shadow-2xl">
				<div className="px-6 pt-7 pb-6">
					<div className="flex flex-col items-center text-center">
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-sienna-600 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
							<span className="text-lg font-bold">C</span>
						</div>
						<h1 className="mt-4 text-xl font-semibold">Join a workspace</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Enter an invite code to join your team on Clave.
						</p>
					</div>

					<div className="mt-6 space-y-4">
						<div className="space-y-2">
							<Input
								placeholder="Enter invite code"
								value={code}
								onChange={(e) => handleCodeChange(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && isValid) handleJoin();
								}}
								className="h-12 rounded-xl text-center font-mono text-lg tracking-widest"
								maxLength={8}
								autoFocus
							/>
						</div>

						{isValid && (
							<div className="rounded-xl border border-border bg-muted/50 p-3 text-center">
								<p className="text-xs text-muted-foreground">You will join</p>
								<p className="mt-0.5 text-sm font-medium">
									{validation.workspaceName}
								</p>
							</div>
						)}

						{isInvalid && (
							<p className="text-center text-sm text-destructive">
								Invalid or expired invite code
							</p>
						)}

						{error && (
							<p className="text-center text-sm text-destructive">{error}</p>
						)}

						<Button
							className="h-11 w-full rounded-xl"
							onClick={handleJoin}
							disabled={
								joining || !code.trim() || (code.length >= 6 && !isValid)
							}
						>
							{joining
								? "Joining..."
								: !isAuthenticated && !authLoading
									? "Sign in and join"
									: "Join workspace"}
						</Button>
					</div>
				</div>

				<div className="border-t border-border/70 bg-muted/40 px-6 py-4 text-center text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link
						href="/sign-in"
						prefetch={false}
						className="text-primary underline underline-offset-4"
					>
						Sign in
					</Link>
				</div>
			</div>
		</div>
	);
}

export default function JoinPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-screen items-center justify-center bg-background">
					<div className="animate-pulse text-muted-foreground">Loading...</div>
				</div>
			}
		>
			<JoinPageContent />
		</Suspense>
	);
}
