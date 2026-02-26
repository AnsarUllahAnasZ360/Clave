"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	buildAuthCallbackRedirect,
	sanitizeInternalRedirect,
} from "@/lib/auth/redirect";

type AuthFlow =
	| "signIn"
	| "signUp"
	| "forgot"
	| "reset-verification"
	| "email-verification";

export function SignInForm({
	defaultFlow = "signIn",
}: {
	defaultFlow?: "signIn" | "signUp";
}) {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [flow, setFlow] = useState<AuthFlow>(defaultFlow);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [name, setName] = useState("");
	const [code, setCode] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);

	const emailIsValid =
		email.trim().length > 3 && email.includes("@") && email.includes(".");
	const passwordIsValid = password.length >= 8;
	const safeRedirectQuery = sanitizeInternalRedirect(
		searchParams.get("redirect"),
		"",
	);
	const postLoginDestination = buildAuthCallbackRedirect(safeRedirectQuery);
	const signInHref = safeRedirectQuery
		? `/sign-in?redirect=${encodeURIComponent(safeRedirectQuery)}`
		: "/sign-in";
	const signUpHref = safeRedirectQuery
		? `/sign-up?redirect=${encodeURIComponent(safeRedirectQuery)}`
		: "/sign-up";

	const handleGoogleSignIn = async () => {
		setError(null);
		setIsLoading(true);
		try {
			const result = await signIn("google", {
				redirectTo: postLoginDestination,
			});
			if (result.redirect) {
				window.location.href = result.redirect.toString();
			}
		} catch {
			setError("Failed to sign in with Google. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleEmailSignIn = async () => {
		if (!emailIsValid || !passwordIsValid) return;
		if (flow === "signUp" && !name.trim()) return;
		setError(null);
		setIsLoading(true);
		try {
			const result = await signIn("password", {
				email: email.trim(),
				password,
				...(flow === "signUp" ? { name: name.trim() } : {}),
				flow: flow === "signUp" ? "signUp" : "signIn",
			});
			if (flow === "signUp" && result.signingIn === false) {
				setFlow("email-verification");
				setInfo("Check your email for a verification code.");
				return;
			}
			router.replace(postLoginDestination as never);
		} catch {
			setError(
				flow === "signIn"
					? "Invalid email or password."
					: "Could not create account. Email may already be in use.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleForgotPassword = async () => {
		if (!emailIsValid) return;
		setError(null);
		setIsLoading(true);
		try {
			await signIn("password", {
				email: email.trim(),
				flow: "reset",
			});
			setFlow("reset-verification");
			setInfo("Check your email for a reset code.");
		} catch {
			setError("Could not send reset code. Check your email address.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleResetVerification = async () => {
		if (!code.trim() || newPassword.length < 8) return;
		setError(null);
		setIsLoading(true);
		try {
			await signIn("password", {
				email: email.trim(),
				code: code.trim(),
				newPassword,
				flow: "reset-verification",
			});
			router.replace(postLoginDestination as never);
		} catch {
			setError("Invalid or expired code. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleEmailVerification = async () => {
		if (!code.trim()) return;
		setError(null);
		setIsLoading(true);
		try {
			await signIn("password", {
				email: email.trim(),
				code: code.trim(),
				flow: "email-verification",
			});
			router.replace(postLoginDestination as never);
		} catch {
			setError("Invalid or expired code. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const switchFlow = (target: AuthFlow) => {
		setFlow(target);
		setError(null);
		setInfo(null);
		setCode("");
		setNewPassword("");
	};

	const title: Record<AuthFlow, string> = {
		signIn: "Welcome back",
		signUp: "Create your account",
		forgot: "Reset your password",
		"reset-verification": "Enter reset code",
		"email-verification": "Verify your email",
	};

	const subtitle: Record<AuthFlow, string> = {
		signIn: "Sign in to continue to Clave",
		signUp: "Get started with Clave",
		forgot: "Enter your email to receive a reset code.",
		"reset-verification": "Enter the code sent to your email.",
		"email-verification": "Enter the verification code sent to your email.",
	};

	return (
		<div className="w-full max-w-[400px]">
			<div className="mb-8">
				<h2 className="text-2xl font-semibold tracking-tight">{title[flow]}</h2>
				<p className="mt-2 text-sm text-muted-foreground">{subtitle[flow]}</p>
			</div>

			<div className="space-y-4">
				{/* Google sign-in — only on signIn / signUp */}
				{(flow === "signIn" || flow === "signUp") && (
					<>
						<Button
							type="button"
							variant="outline"
							className="h-11 w-full justify-center gap-2"
							onClick={handleGoogleSignIn}
							disabled={isLoading}
						>
							<GoogleIcon className="h-4 w-4" />
							Continue with Google
						</Button>

						<div className="flex items-center gap-3">
							<Separator className="flex-1" />
							<span className="text-xs text-muted-foreground">or</span>
							<Separator className="flex-1" />
						</div>
					</>
				)}

				{/* Name field — signUp only */}
				{flow === "signUp" && (
					<div className="space-y-2">
						<Label htmlFor="sign-in-name">Full name</Label>
						<Input
							id="sign-in-name"
							type="text"
							placeholder="Your name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							autoComplete="name"
							className="h-10"
							disabled={isLoading}
						/>
					</div>
				)}

				{/* Email field — signIn, signUp, forgot */}
				{(flow === "signIn" || flow === "signUp" || flow === "forgot") && (
					<div className="space-y-2">
						<Label htmlFor="sign-in-email">Email</Label>
						<Input
							id="sign-in-email"
							type="email"
							placeholder="name@example.com"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="email"
							className="h-10"
							disabled={isLoading}
						/>
					</div>
				)}

				{/* Password field — signIn, signUp */}
				{(flow === "signIn" || flow === "signUp") && (
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="sign-in-password">Password</Label>
							{flow === "signIn" && (
								<button
									type="button"
									className="text-xs text-muted-foreground hover:text-foreground transition-colors"
									onClick={() => switchFlow("forgot")}
								>
									Forgot password?
								</button>
							)}
						</div>
						<Input
							id="sign-in-password"
							type="password"
							placeholder={
								flow === "signUp" ? "At least 8 characters" : "Your password"
							}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									emailIsValid &&
									passwordIsValid &&
									!isLoading
								) {
									handleEmailSignIn();
								}
							}}
							autoComplete={
								flow === "signUp" ? "new-password" : "current-password"
							}
							className="h-10"
							disabled={isLoading}
						/>
						{flow === "signUp" && (
							<p className="text-xs text-muted-foreground">
								At least 8 characters with a mix of letters and numbers
							</p>
						)}
					</div>
				)}

				{/* Verification code — reset-verification, email-verification */}
				{(flow === "reset-verification" || flow === "email-verification") && (
					<div className="space-y-2">
						<Label htmlFor="otp-code">Verification code</Label>
						<Input
							id="otp-code"
							type="text"
							inputMode="numeric"
							placeholder="12345678"
							value={code}
							onChange={(event) =>
								setCode(event.target.value.replace(/\D/g, "").slice(0, 8))
							}
							className="h-10 font-mono text-center text-lg tracking-widest"
							maxLength={8}
							disabled={isLoading}
							autoFocus
						/>
					</div>
				)}

				{/* New password — reset-verification only */}
				{flow === "reset-verification" && (
					<div className="space-y-2">
						<Label htmlFor="new-password">New password</Label>
						<Input
							id="new-password"
							type="password"
							placeholder="At least 8 characters"
							value={newPassword}
							onChange={(event) => setNewPassword(event.target.value)}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									code.trim() &&
									newPassword.length >= 8 &&
									!isLoading
								) {
									handleResetVerification();
								}
							}}
							autoComplete="new-password"
							className="h-10"
							disabled={isLoading}
						/>
					</div>
				)}

				{info && <p className="text-sm text-emerald-500">{info}</p>}
				{error && <p className="text-sm text-destructive">{error}</p>}

				{/* Action buttons */}
				{(flow === "signIn" || flow === "signUp") && (
					<Button
						type="button"
						className="h-10 w-full"
						onClick={handleEmailSignIn}
						disabled={
							!emailIsValid ||
							!passwordIsValid ||
							(flow === "signUp" && !name.trim()) ||
							isLoading
						}
					>
						{isLoading
							? "Please wait..."
							: flow === "signIn"
								? "Sign in"
								: "Create account"}
						{!isLoading && <ArrowRight className="ml-1 h-4 w-4" />}
					</Button>
				)}

				{flow === "forgot" && (
					<Button
						type="button"
						className="h-10 w-full"
						onClick={handleForgotPassword}
						disabled={!emailIsValid || isLoading}
					>
						{isLoading ? "Sending..." : "Send reset code"}
					</Button>
				)}

				{flow === "reset-verification" && (
					<Button
						type="button"
						className="h-10 w-full"
						onClick={handleResetVerification}
						disabled={!code.trim() || newPassword.length < 8 || isLoading}
					>
						{isLoading ? "Resetting..." : "Reset password"}
					</Button>
				)}

				{flow === "email-verification" && (
					<Button
						type="button"
						className="h-10 w-full"
						onClick={handleEmailVerification}
						disabled={!code.trim() || isLoading}
					>
						{isLoading ? "Verifying..." : "Verify email"}
					</Button>
				)}
			</div>

			{/* Footer — flow toggle */}
			<div className="mt-6 text-center text-sm text-muted-foreground">
				{flow === "signIn" && (
					<>
						Don&apos;t have an account?{" "}
						<Link
							href={signUpHref as never}
							prefetch={false}
							className="font-medium text-foreground hover:underline"
						>
							Sign up
						</Link>
					</>
				)}
				{flow === "signUp" && (
					<>
						Already have an account?{" "}
						<Link
							href={signInHref as never}
							prefetch={false}
							className="font-medium text-foreground hover:underline"
						>
							Sign in
						</Link>
					</>
				)}
				{(flow === "forgot" ||
					flow === "reset-verification" ||
					flow === "email-verification") && (
					<button
						type="button"
						className="font-medium text-foreground hover:underline"
						onClick={() => switchFlow("signIn")}
					>
						Back to sign in
					</button>
				)}
			</div>

			{process.env.NEXT_PUBLIC_DEV_MODE === "true" && (
				<div className="mt-6 text-center">
					<Link
						href="/dev-login"
						prefetch={false}
						className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/10"
					>
						Development mode — use dev login
					</Link>
				</div>
			)}
		</div>
	);
}

function GoogleIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" aria-hidden className={className}>
			<title>Google</title>
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
