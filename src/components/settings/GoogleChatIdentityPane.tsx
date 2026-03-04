"use client";

import {
	ChatCircleText,
	LinkBreak,
	UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Button } from "@/components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	PaneDescription,
	PaneTitle,
	SettingSection,
} from "./settings-shared";

const getMyLinkRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	{
		_id: Id<"chatUserLinks">;
		_creationTime: number;
		workspaceId: Id<"workspaces">;
		provider: "google-chat";
		chatUserId: string;
		chatDisplayName?: string;
		chatEmail?: string;
		userId: Id<"users">;
		linkedBy: Id<"users">;
		linkedAt: number;
		updatedAt: number;
	} | null
>("chatIdentityLinks:getMyLink");

const getMyPendingCodeRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces"> },
	{ code: string; expiresAt: number } | null
>("chatVerificationCodes:getMyPendingCode");

const generateCodeRef = makeFunctionReference<
	"mutation",
	{ workspaceId: Id<"workspaces"> },
	{ code: string; expiresAt: number }
>("chatVerificationCodes:generateCode");

const unlinkSelfRef = makeFunctionReference<
	"mutation",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	null
>("chatIdentityLinks:unlinkSelf");

export function GoogleChatIdentityPane() {
	const workspace = useWorkspaceOptional();

	const myLink = useQuery(
		getMyLinkRef,
		workspace
			? {
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
				}
			: "skip",
	);

	const pendingCode = useQuery(
		getMyPendingCodeRef,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);

	const generateCode = useMutation(generateCodeRef);
	const unlinkSelf = useMutation(unlinkSelfRef);

	const [isGenerating, setIsGenerating] = useState(false);
	const [isUnlinking, setIsUnlinking] = useState(false);
	const [countdown, setCountdown] = useState<number>(0);

	// Countdown timer for pending code
	useEffect(() => {
		if (!pendingCode) {
			setCountdown(0);
			return;
		}
		const update = () => {
			const remaining = Math.max(
				0,
				Math.ceil((pendingCode.expiresAt - Date.now()) / 1000),
			);
			setCountdown(remaining);
		};
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	}, [pendingCode]);

	const handleGenerateCode = useCallback(async () => {
		if (!workspace) return;
		setIsGenerating(true);
		try {
			await generateCode({ workspaceId: workspace.workspaceId });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to generate verification code",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [workspace, generateCode]);

	const handleUnlink = useCallback(async () => {
		if (!workspace) return;
		setIsUnlinking(true);
		try {
			await unlinkSelf({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
			});
			toast.success("Google Chat identity unlinked");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to unlink identity",
			);
		} finally {
			setIsUnlinking(false);
		}
	}, [workspace, unlinkSelf]);

	const formatCountdown = (seconds: number) => {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	return (
		<div className="space-y-7">
			<div>
				<PaneTitle>Google Chat identity</PaneTitle>
				<PaneDescription className="mt-1">
					Link your Google Chat account to your Clave identity so actions
					you take in Google Chat are attributed to you.
				</PaneDescription>
			</div>

			{myLink ? (
				<SettingSection title="Linked account">
					<div className="rounded-lg border border-border bg-card/70 px-4 py-4 space-y-3">
						<div className="flex items-center gap-3">
							<UserCircle className="h-5 w-5 text-emerald-400" />
							<div>
								<p className="text-sm font-medium text-foreground">
									{myLink.chatDisplayName ?? "Google Chat user"}
								</p>
								<p className="text-xs text-muted-foreground">
									{myLink.chatEmail ?? myLink.chatUserId}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-4 text-xs text-muted-foreground">
							<span>
								Chat ID: {myLink.chatUserId}
							</span>
							<span>
								Linked{" "}
								{new Date(myLink.linkedAt).toLocaleDateString()}
							</span>
						</div>
					</div>
					<Button
						variant="outline"
						onClick={handleUnlink}
						disabled={isUnlinking}
						className="inline-flex items-center gap-2"
					>
						<LinkBreak className="h-4 w-4" />
						Unlink
					</Button>
				</SettingSection>
			) : (
				<SettingSection title="Link your account">
					{pendingCode && countdown > 0 ? (
						<div className="space-y-4">
							<div className="rounded-lg border border-border bg-muted/30 px-4 py-4 space-y-3">
								<p className="text-sm text-foreground font-medium">
									Send this code to Clave in Google Chat
								</p>
								<div className="flex items-center gap-4">
									<span className="font-mono text-2xl font-bold tracking-widest text-foreground">
										{pendingCode.code}
									</span>
									<span className="text-xs text-muted-foreground">
										Expires in {formatCountdown(countdown)}
									</span>
								</div>
								<ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground leading-relaxed">
									<li>
										Open a DM with the Clave bot in Google
										Chat
									</li>
									<li>
										Send the code above as a message
									</li>
									<li>
										This page will update automatically once
										linked
									</li>
								</ol>
							</div>
							<Button
								variant="outline"
								onClick={handleGenerateCode}
								disabled={isGenerating}
							>
								Generate new code
							</Button>
						</div>
					) : (
						<div className="space-y-4">
							<div className="rounded-lg border border-border bg-muted/30 px-4 py-4 space-y-2">
								<p className="text-sm text-foreground">
									Generate a one-time code, then DM it to the
									Clave bot in Google Chat to link your
									identity.
								</p>
								<p className="text-xs text-muted-foreground">
									The code is valid for 5 minutes.
								</p>
							</div>
							<Button
								onClick={handleGenerateCode}
								disabled={isGenerating || !workspace}
								className="inline-flex items-center gap-2"
							>
								<ChatCircleText className="h-4 w-4" />
								Generate code
							</Button>
						</div>
					)}
				</SettingSection>
			)}
		</div>
	);
}
