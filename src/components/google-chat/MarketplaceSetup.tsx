"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { CheckCircle, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Id } from "../../../convex/_generated/dataModel";

interface VerifyResult {
	valid: boolean;
	marketplaceProjectNumber: string | null;
	marketplaceInstallId: string | null;
}

interface WorkspaceWithRole {
	_id: Id<"workspaces">;
	name: string;
	slug: string;
	role: string;
	logoStorageId?: Id<"_storage">;
}

const listWithRoleRef = makeFunctionReference<
	"query",
	Record<string, never>,
	WorkspaceWithRole[]
>("workspaces:listWithRole");

const connectRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		webhookUrl?: string;
		externalAppName?: string;
		marketplaceProjectNumber?: string;
		marketplaceInstallId?: string;
	},
	Id<"chatConnections">
>("chatIntegrations:connect");

type Step = "verifying" | "auth" | "pick" | "connecting" | "done" | "error";

export function MarketplaceSetup() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { isAuthenticated, isLoading: authLoading } = useConvexAuth();

	const [step, setStep] = useState<Step>("verifying");
	const [error, setError] = useState<string | null>(null);
	const [marketplaceData, setMarketplaceData] = useState<{
		projectNumber: string;
		installId: string | null;
	} | null>(null);
	const [selectedWorkspace, setSelectedWorkspace] =
		useState<Id<"workspaces"> | null>(null);

	const workspaces = useQuery(listWithRoleRef, isAuthenticated ? {} : "skip");
	const connectMutation = useMutation(connectRef);

	const adminWorkspaces = workspaces?.filter((w) => w.role === "admin");

	// Verify the state token on mount
	useEffect(() => {
		const state = searchParams.get("state");
		if (!state) {
			setError(
				"Missing state parameter. Please start the install from Google Workspace Marketplace.",
			);
			setStep("error");
			return;
		}

		let cancelled = false;

		async function verify() {
			try {
				const res = await fetch("/api/google-chat/marketplace/verify", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ state }),
				});
				if (cancelled) return;

				if (!res.ok) {
					setError(
						"Invalid or expired setup link. Please try installing again from the Marketplace.",
					);
					setStep("error");
					return;
				}

				const data = (await res.json()) as VerifyResult;
				if (!data.valid || !data.marketplaceProjectNumber) {
					setError("Invalid setup link.");
					setStep("error");
					return;
				}

				setMarketplaceData({
					projectNumber: data.marketplaceProjectNumber,
					installId: data.marketplaceInstallId,
				});
				setStep("auth");
			} catch {
				if (!cancelled) {
					setError("Failed to verify setup link.");
					setStep("error");
				}
			}
		}

		void verify();
		return () => {
			cancelled = true;
		};
	}, [searchParams]);

	// Handle auth gate: redirect to sign-in if not authenticated
	useEffect(() => {
		if (step !== "auth" || authLoading) return;

		if (isAuthenticated) {
			setStep("pick");
			return;
		}

		// Store return URL and redirect to sign-in
		const returnUrl = `${window.location.pathname}${window.location.search}`;
		sessionStorage.setItem("google-chat-setup-return", returnUrl);
		router.push(`/sign-in?redirect=${encodeURIComponent(returnUrl)}`);
	}, [step, authLoading, isAuthenticated, router]);

	const handleConnect = useCallback(async () => {
		if (!selectedWorkspace || !marketplaceData) return;

		setStep("connecting");
		try {
			const webhookUrl = (() => {
				const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
				if (configuredUrl) {
					return `${configuredUrl.replace(/\/$/, "")}/api/webhooks/google-chat`;
				}
				if (typeof window !== "undefined") {
					return `${window.location.origin}/api/webhooks/google-chat`;
				}
				return "/api/webhooks/google-chat";
			})();

			await connectMutation({
				workspaceId: selectedWorkspace,
				provider: "google-chat",
				webhookUrl,
				externalAppName: "Clave",
				marketplaceProjectNumber: marketplaceData.projectNumber,
				marketplaceInstallId: marketplaceData.installId ?? undefined,
			});

			setStep("done");

			// Find the workspace slug for redirect
			const ws = adminWorkspaces?.find((w) => w._id === selectedWorkspace);
			if (ws) {
				setTimeout(() => {
					router.push(`/${ws.slug}/settings?section=google-chat`);
				}, 1500);
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to connect workspace",
			);
			setStep("error");
		}
	}, [
		selectedWorkspace,
		marketplaceData,
		connectMutation,
		adminWorkspaces,
		router,
	]);

	if (step === "verifying" || (step === "auth" && authLoading)) {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
					<CardTitle className="text-lg">Setting up Google Chat</CardTitle>
					<CardDescription>Verifying your installation...</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (step === "error") {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<CardTitle className="text-lg">Setup failed</CardTitle>
					<CardDescription className="text-destructive">
						{error}
					</CardDescription>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => router.push("/")}
					>
						Go to Clave
					</Button>
				</CardHeader>
			</Card>
		);
	}

	if (step === "auth") {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
					<CardTitle className="text-lg">Sign in required</CardTitle>
					<CardDescription>Redirecting to sign in...</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (step === "done") {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
					<CardTitle className="text-lg">Connected</CardTitle>
					<CardDescription>
						Google Chat is now connected to your workspace. Redirecting to
						settings...
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (step === "connecting") {
		return (
			<Card className="w-full max-w-md">
				<CardHeader className="items-center text-center">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
					<CardTitle className="text-lg">Connecting</CardTitle>
					<CardDescription>
						Setting up Google Chat integration...
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	// step === "pick"
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle className="text-lg">Connect Google Chat</CardTitle>
				<CardDescription>
					Select the workspace to connect with Google Chat from the Marketplace.
				</CardDescription>
			</CardHeader>
			<div className="px-6 pb-6 space-y-3">
				{!adminWorkspaces ? (
					<div className="flex items-center justify-center py-6">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				) : adminWorkspaces.length === 0 ? (
					<p className="text-sm text-muted-foreground py-4 text-center">
						You are not an admin of any workspaces. Ask a workspace admin to set
						up the integration.
					</p>
				) : (
					<>
						<div className="space-y-2">
							{adminWorkspaces.map((ws) => (
								<button
									key={ws._id}
									type="button"
									onClick={() => setSelectedWorkspace(ws._id)}
									className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
										selectedWorkspace === ws._id
											? "border-sienna-500 bg-sienna-500/10"
											: "border-border bg-card hover:bg-accent/50"
									}`}
								>
									<p className="text-sm font-medium text-foreground">
										{ws.name}
									</p>
									<p className="text-xs text-muted-foreground">{ws.slug}</p>
								</button>
							))}
						</div>
						<Button
							className="w-full"
							disabled={!selectedWorkspace}
							onClick={() => void handleConnect()}
						>
							Connect
						</Button>
					</>
				)}
			</div>
		</Card>
	);
}
