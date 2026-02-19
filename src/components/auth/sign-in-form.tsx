"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type SignInStep = "initial" | "magic-link-sent";

export function SignInForm() {
	const { signIn } = useAuthActions();
	const [step, setStep] = useState<SignInStep>("initial");
	const [email, setEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const emailIsValid =
		email.trim().length > 3 && email.includes("@") && email.includes(".");

	const handleGoogleSignIn = async () => {
		setError(null);
		setIsLoading(true);
		try {
			const result = await signIn("google");
			if (result.redirect) {
				window.location.href = result.redirect.toString();
			}
		} catch {
			setError("Failed to sign in with Google. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleMagicLink = async () => {
		if (!emailIsValid) return;
		setError(null);
		setIsLoading(true);
		try {
			await signIn("resend", { email: email.trim() });
			setStep("magic-link-sent");
		} catch {
			setError("Failed to send magic link. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	if (step === "magic-link-sent") {
		return (
			<div className="w-full max-w-[460px] rounded-3xl border border-border bg-card p-6 shadow-2xl">
				<div className="flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-sienna-600 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
						<span className="text-lg font-bold">C</span>
					</div>
					<h2 className="mt-4 text-xl font-semibold">Check your email</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						We sent a sign-in link to{" "}
						<span className="font-medium text-foreground">{email}</span>
					</p>
					<p className="mt-4 text-xs text-muted-foreground">
						Click the link in your email to sign in. If you don't see it, check
						your spam folder.
					</p>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="mt-4"
						onClick={() => {
							setStep("initial");
							setEmail("");
						}}
					>
						Use a different email
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full max-w-[460px] rounded-3xl border border-border bg-card shadow-2xl">
			<div className="px-6 pt-7 pb-6">
				<div className="flex flex-col items-center text-center">
					<div className="flex h-12 w-12 items-center justify-center rounded-full bg-sienna-600 text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]">
						<span className="text-lg font-bold">C</span>
					</div>
					<h2 className="mt-4 text-xl font-semibold">Sign in to Clave</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Welcome back! Please sign in to continue.
					</p>
				</div>

				<div className="mt-6 space-y-4">
					<Button
						type="button"
						variant="outline"
						className="h-11 w-full justify-center gap-2 rounded-xl border-border bg-muted/20"
						onClick={handleGoogleSignIn}
						disabled={isLoading}
					>
						<GoogleIcon className="h-4 w-4" />
						Continue with Google
					</Button>

					<div className="flex items-center gap-3">
						<Separator className="flex-1" />
						<span className="text-xs text-muted-foreground">
							or continue with email
						</span>
						<Separator className="flex-1" />
					</div>

					<div className="space-y-2">
						<Label htmlFor="sign-in-email">Email address</Label>
						<Input
							id="sign-in-email"
							type="email"
							placeholder="Enter your email address"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && emailIsValid && !isLoading) {
									handleMagicLink();
								}
							}}
							autoComplete="email"
							className="h-11 rounded-xl"
							disabled={isLoading}
						/>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}

					<Button
						type="button"
						className="h-11 w-full rounded-xl"
						onClick={handleMagicLink}
						disabled={!emailIsValid || isLoading}
					>
						{isLoading ? "Sending..." : "Send magic link"}
						{!isLoading && <ArrowRight className="ml-1 h-4 w-4" />}
					</Button>
				</div>
			</div>

			<div className="border-t border-border/70 bg-muted/40 px-6 py-4 text-center text-sm text-muted-foreground">
				By signing in, you agree to our Terms of Service and Privacy Policy.
			</div>

			{process.env.NEXT_PUBLIC_DEV_MODE === "true" && (
				<div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-3 text-center">
					<a
						href="/dev-login"
						className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/10"
					>
						Development mode — use dev login
					</a>
				</div>
			)}
		</div>
	);
}

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden className={className}>
			<path
				fill="#EA4335"
				d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.4l2.6-2.6C16.6 3 14.5 2 12 2 6.9 2 2.8 6.1 2.8 11.9S6.9 21.8 12 21.8c6.9 0 8.6-4.8 8.6-7.2 0-.5-.1-1-.2-1.4H12z"
			/>
			<path
				fill="#34A853"
				d="M3.8 7.1l3.2 2.3C7.9 7.2 9.8 5.8 12 5.8c1.9 0 3.1.8 3.8 1.4l2.6-2.6C16.6 3 14.5 2 12 2 8.2 2 5 4.2 3.8 7.1z"
			/>
			<path
				fill="#FBBC05"
				d="M12 21.8c3.4 0 6.2-1.1 8.3-3l-3.8-2.9c-1 .7-2.3 1.2-4.5 1.2-3.2 0-5.9-2.1-6.8-5l-3.2 2.5c1.2 3.6 4.7 6.2 10 6.2z"
			/>
			<path
				fill="#4285F4"
				d="M20.6 14.6c.1-.4.2-.9.2-1.4 0-.5-.1-1-.2-1.4H12v2.8h5.5c-.3 1.5-1.3 2.7-2.8 3.5l3.8 2.9c2.2-2 2.9-4.9 2.9-7.4z"
			/>
		</svg>
	);
}
