// Dev-only login page for local development.
// Requires NEXT_PUBLIC_DEV_MODE=true to be set in .env.local
// Uses @convex-dev/auth Password provider with hardcoded dev credentials.

"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import { useAction } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "../../../../convex/_generated/api";

const DEV_PASSWORD = "devmode123";

const DEV_USERS = [
	{
		name: "Kul",
		email: "kul@goclave.app",
		role: "Founder & CEO",
		badge: "Super Admin",
		initials: "K",
	},
	{
		name: "Alex Chen",
		email: "alex@goclave.app",
		role: "Lead Engineer",
		badge: "Admin",
		initials: "AC",
	},
	{
		name: "Jordan Rivera",
		email: "jordan@goclave.app",
		role: "Designer",
		badge: "Member",
		initials: "JR",
	},
] as const;

function isDevMode() {
	return process.env.NEXT_PUBLIC_DEV_MODE === "true";
}

export default function DevLoginPage() {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const [loading, setLoading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Seed database actions
	const seedDb = useAction(api.devInit.seedDatabase);
	const clearDb = useAction(api.devInit.clearDatabase);
	const [seedStatus, setSeedStatus] = useState<
		"idle" | "seeding" | "clearing" | "success" | "error"
	>("idle");
	const [seedMessage, setSeedMessage] = useState<string | null>(null);

	const handleSeed = useCallback(async () => {
		setSeedStatus("seeding");
		setSeedMessage(null);
		try {
			const result = await seedDb();
			setSeedStatus("success");
			setSeedMessage(result.message);
		} catch (e) {
			setSeedStatus("error");
			setSeedMessage(e instanceof Error ? e.message : "Failed to seed data.");
		}
	}, [seedDb]);

	const handleClear = useCallback(async () => {
		setSeedStatus("clearing");
		setSeedMessage(null);
		try {
			const result = await clearDb();
			setSeedStatus("success");
			setSeedMessage(result.message);
		} catch (e) {
			setSeedStatus("error");
			setSeedMessage(e instanceof Error ? e.message : "Failed to clear data.");
		}
	}, [clearDb]);

	const handleDevSignIn = useCallback(
		async (user: (typeof DEV_USERS)[number]) => {
			setError(null);
			setLoading(user.email);
			try {
				// Try signUp first (creates the account if it doesn't exist)
				try {
					await signIn("password", {
						email: user.email,
						password: DEV_PASSWORD,
						name: user.name,
						flow: "signUp",
					});
				} catch {
					// Account likely already exists, proceed to signIn
					await signIn("password", {
						email: user.email,
						password: DEV_PASSWORD,
						flow: "signIn",
					});
				}

				// Workspace membership is auto-created by the afterUserCreatedOrUpdated
				// callback in convex/auth.ts during sign-in
				router.push("/clave-hq/projects");
			} catch {
				setError(
					`Failed to sign in as ${user.name}. Check that Convex dev server is running.`,
				);
			} finally {
				setLoading(null);
			}
		},
		[signIn, router],
	);

	// Redirect to sign-in in production
	if (!isDevMode()) {
		if (typeof window !== "undefined") {
			router.replace("/sign-in");
		}
		return null;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="w-full max-w-[460px]">
				{/* Dev mode banner */}
				<div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
					<ShieldWarning
						className="h-5 w-5 shrink-0 text-amber-500"
						weight="fill"
					/>
					<p className="text-sm font-medium text-amber-500">
						Development mode — bypass auth for local testing
					</p>
				</div>

				<div className="rounded-3xl border border-border bg-card shadow-2xl">
					<div className="px-6 pt-7 pb-6">
						<div className="flex flex-col items-center text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-sienna-600 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
								<span className="text-lg font-bold">C</span>
							</div>
							<h2 className="mt-4 text-xl font-semibold">Dev login</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Choose a dev user to sign in as.
							</p>
						</div>

						{error && (
							<p className="mt-4 text-center text-sm text-destructive">
								{error}
							</p>
						)}

						<div className="mt-6 space-y-3">
							{DEV_USERS.map((user) => (
								<button
									key={user.email}
									type="button"
									className="flex w-full items-center gap-4 rounded-xl border border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
									onClick={() => handleDevSignIn(user)}
									disabled={loading !== null}
								>
									{/* Avatar initials */}
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sienna-600/20 text-sm font-semibold text-sienna-600">
										{user.initials}
									</div>

									{/* Info */}
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium text-foreground">
												{user.name}
											</span>
											<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
												{user.badge}
											</span>
										</div>
										<p className="text-xs text-muted-foreground">
											{user.email}
										</p>
										<p className="text-xs text-muted-foreground/70">
											{user.role}
										</p>
									</div>

									{/* Action */}
									<span
										className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 py-1 text-sm font-medium text-foreground shadow-sm"
										aria-hidden="true"
									>
										{loading === user.email ? "Signing in..." : "Sign in"}
									</span>
								</button>
							))}
						</div>
					</div>

					{/* Database seed controls */}
					<div className="border-t border-border/70 px-6 py-4">
						<p className="mb-3 text-center text-xs font-medium text-muted-foreground">
							Sample data
						</p>
						<div className="flex gap-2">
							<Button
								size="sm"
								variant="outline"
								className="flex-1 rounded-lg"
								onClick={handleSeed}
								disabled={seedStatus === "seeding" || seedStatus === "clearing"}
							>
								{seedStatus === "seeding" ? "Seeding..." : "Seed database"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="flex-1 rounded-lg text-destructive hover:text-destructive"
								onClick={handleClear}
								disabled={seedStatus === "seeding" || seedStatus === "clearing"}
							>
								{seedStatus === "clearing" ? "Clearing..." : "Reset data"}
							</Button>
						</div>
						{seedMessage && (
							<p
								className={`mt-2 text-center text-xs ${seedStatus === "error" ? "text-destructive" : "text-emerald-500"}`}
							>
								{seedMessage}
							</p>
						)}
					</div>

					<div className="border-t border-border/70 bg-muted/40 px-6 py-4 text-center">
						<a
							href="/sign-in"
							className="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Use regular sign in instead
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
