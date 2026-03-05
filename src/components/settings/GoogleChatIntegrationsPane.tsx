"use client";

import {
	ChatCircleText,
	CopySimple,
	Info,
	Lock,
	Plug,
	ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Id } from "../../../convex/_generated/dataModel";
import { GoogleChatSubscriptionsPane } from "./GoogleChatSubscriptionsPane";
import {
	PaneDescription,
	PaneTitle,
	SettingRow,
	SettingSection,
} from "./settings-shared";

const ISSUE_ACTION_ALLOWLIST_OPTIONS = [
	{
		id: "assign_to_me",
		label: "Allow assign to me",
		description: "Allow users to self-assign issues from Google Chat cards.",
	},
	{
		id: "set_status_non_destructive",
		label: "Allow non-destructive status updates",
		description:
			"Allow transitions to triage, backlog, todo, in progress, and in review.",
	},
	{
		id: "open_issue_link",
		label: "Allow open issue link",
		description: "Allow cards to return deep links to issue detail pages.",
	},
] as const;

const getConnectionStatusRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	{
		provider: "google-chat";
		connection: {
			status: "connected" | "disconnected" | "error";
			authAudience?: string;
			externalAppName?: string;
			webhookUrl?: string;
		} | null;
		policy: {
			enabled: boolean;
			allowDirectMessages: boolean;
			allowSpaces: boolean;
			requireIdentityLink: boolean;
			allowedIssueActionIds: string[];
			requireActionConfirmation: boolean;
		} | null;
	}
>("chatIntegrations:getConnectionStatus");

const connectRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		webhookUrl?: string;
		authAudience?: string;
		externalAppName?: string;
	},
	Id<"chatConnections">
>("chatIntegrations:connect");

const disconnectRef = makeFunctionReference<
	"mutation",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	null
>("chatIntegrations:disconnect");

const updatePolicyRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		enabled?: boolean;
		allowDirectMessages?: boolean;
		allowSpaces?: boolean;
		requireIdentityLink?: boolean;
		allowedIssueActionIds?: string[];
		requireActionConfirmation?: boolean;
	},
	Id<"chatPolicies">
>("chatIntegrations:updatePolicy");

export function GoogleChatIntegrationsPane() {
	const workspace = useWorkspaceOptional();
	const members = useWorkspaceMembers();
	const currentUser = useCurrentUser();
	const currentMember = members?.find(
		(member) => member.userId === currentUser?._id,
	);
	const isAdmin = currentMember?.role === "admin";

	const status = useQuery(
		getConnectionStatusRef,
		workspace
			? {
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
				}
			: "skip",
	);
	const connect = useMutation(connectRef);
	const disconnect = useMutation(disconnectRef);
	const updatePolicy = useMutation(updatePolicyRef);

	const [appName, setAppName] = useState("");
	const [audience, setAudience] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const webhookEndpoint = useMemo(() => {
		const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
		if (configuredUrl) {
			return `${configuredUrl.replace(/\/$/, "")}/api/webhooks/google-chat`;
		}
		if (typeof window !== "undefined") {
			return `${window.location.origin}/api/webhooks/google-chat`;
		}
		return "/api/webhooks/google-chat";
	}, []);

	const connection = status?.connection ?? null;
	const policy = status?.policy;
	const effectivePolicy = {
		enabled: policy?.enabled ?? true,
		allowDirectMessages: policy?.allowDirectMessages ?? true,
		allowSpaces: policy?.allowSpaces ?? true,
		requireIdentityLink: policy?.requireIdentityLink ?? true,
		allowedIssueActionIds: policy?.allowedIssueActionIds ?? [
			"assign_to_me",
			"set_status_non_destructive",
			"open_issue_link",
		],
		requireActionConfirmation: policy?.requireActionConfirmation ?? false,
	};
	const isConnected = connection?.status === "connected";

	const handleConnect = useCallback(async () => {
		if (!workspace) return;
		setIsSubmitting(true);
		try {
			await connect({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
				webhookUrl: webhookEndpoint,
				externalAppName: appName.trim() || undefined,
				authAudience: audience.trim() || undefined,
			});
			toast.success("Google Chat connected");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to connect Google Chat",
			);
		} finally {
			setIsSubmitting(false);
		}
	}, [workspace, connect, webhookEndpoint, appName, audience]);

	const handleDisconnect = useCallback(async () => {
		if (!workspace) return;
		setIsSubmitting(true);
		try {
			await disconnect({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
			});
			toast.success("Google Chat disconnected");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to disconnect Google Chat",
			);
		} finally {
			setIsSubmitting(false);
		}
	}, [workspace, disconnect]);

	const handlePolicyChange = useCallback(
		async (patch: {
			enabled?: boolean;
			allowDirectMessages?: boolean;
			allowSpaces?: boolean;
			requireIdentityLink?: boolean;
			allowedIssueActionIds?: string[];
			requireActionConfirmation?: boolean;
		}) => {
			if (!workspace) return;
			try {
				await updatePolicy({
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
					...patch,
				});
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update Google Chat policy",
				);
			}
		},
		[workspace, updatePolicy],
	);

	const toggleIssueActionAllowlist = useCallback(
		(actionId: string, checked: boolean) => {
			const existing = effectivePolicy.allowedIssueActionIds;
			const next = checked
				? Array.from(new Set([...existing, actionId]))
				: existing.filter((value) => value !== actionId);
			void handlePolicyChange({ allowedIssueActionIds: next });
		},
		[effectivePolicy.allowedIssueActionIds, handlePolicyChange],
	);

	if (!isAdmin) {
		return (
			<div className="space-y-4">
				<PaneTitle>Google Chat</PaneTitle>
				<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3">
					<Lock className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						Admin access required to manage Google Chat integration.
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-7">
			<div>
				<PaneTitle>Google Chat</PaneTitle>
				<PaneDescription className="mt-1">
					Connect Google Chat for workspace-level notifications and actions.
				</PaneDescription>
			</div>

			<SettingSection title="Connection">
				{!isConnected && (
					<div className="flex gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
						<Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="space-y-1 text-xs text-muted-foreground">
							<p className="font-medium text-foreground">Before connecting</p>
							<ol className="list-decimal space-y-0.5 pl-3.5">
								<li>Create a Google Cloud project with the Chat API enabled</li>
								<li>Create a service account and download the JSON key</li>
								<li>
									Set{" "}
									<code className="rounded bg-muted px-1 py-0.5">
										GOOGLE_CHAT_CREDENTIALS
									</code>{" "}
									in Convex with the full JSON key
								</li>
								<li>
									Configure the Chat app in Google Cloud Console with the
									webhook endpoint below
								</li>
								<li>Publish the app to your Google Workspace domain</li>
							</ol>
						</div>
					</div>
				)}

				<SettingRow
					label="Current status"
					description="Connection status for the Google Chat integration."
				>
					<span
						className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
							isConnected
								? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
								: "border-border bg-muted text-muted-foreground"
						}`}
					>
						<Plug className="h-3.5 w-3.5" />
						{connection?.status ?? "not connected"}
					</span>
				</SettingRow>

				<SettingRow
					label="App display name"
					description="Name of your Chat app as configured in Google Cloud Console."
				>
					<Input
						placeholder="Clave"
						value={appName}
						onChange={(event) => setAppName(event.target.value)}
					/>
				</SettingRow>

				<SettingRow
					label="Auth audience"
					description="Must match the webhook endpoint URL. Used to verify inbound webhook tokens from Google."
				>
					<Input
						placeholder={webhookEndpoint}
						value={audience}
						onChange={(event) => setAudience(event.target.value)}
					/>
				</SettingRow>

				<SettingRow
					label="Webhook endpoint"
					description="Copy this URL into your Google Cloud Console Chat API configuration."
				>
					<div className="flex items-center gap-2">
						<div className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
							{webhookEndpoint}
						</div>
						<Button
							variant="ghost"
							size="sm"
							className="h-8 shrink-0 px-2"
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(webhookEndpoint);
									toast.success("Webhook endpoint copied");
								} catch {
									toast.error("Failed to copy");
								}
							}}
						>
							<CopySimple className="h-4 w-4" />
						</Button>
					</div>
				</SettingRow>

				<div className="flex flex-wrap gap-2">
					<Button
						onClick={handleConnect}
						disabled={isSubmitting || !workspace}
						className="inline-flex items-center gap-2"
					>
						<ChatCircleText className="h-4 w-4" />
						{isConnected ? "Reconnect" : "Connect Google Chat"}
					</Button>
					<Button
						variant="outline"
						onClick={handleDisconnect}
						disabled={isSubmitting || !workspace || !connection}
					>
						Disconnect
					</Button>
				</div>

				{isConnected && (
					<div className="flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
						<Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
						<div className="space-y-1 text-xs text-muted-foreground">
							<p className="font-medium text-emerald-400">Connected</p>
							<p>
								To find the bot in Google Chat, open chat.google.com and search
								for your app name. The app must be published in your Google
								Workspace domain to appear in search.
							</p>
						</div>
					</div>
				)}
			</SettingSection>

			<SettingSection title="Policy">
				<SettingRow
					label="Enable integration"
					description="Disable to pause all Google Chat deliveries for this workspace."
				>
					<Switch
						checked={effectivePolicy.enabled}
						onCheckedChange={(checked) =>
							void handlePolicyChange({ enabled: checked })
						}
					/>
				</SettingRow>
				<SettingRow
					label="Allow direct messages"
					description="Allow the integration to deliver notifications into DMs."
				>
					<Switch
						checked={effectivePolicy.allowDirectMessages}
						onCheckedChange={(checked) =>
							void handlePolicyChange({ allowDirectMessages: checked })
						}
					/>
				</SettingRow>
				<SettingRow
					label="Allow spaces"
					description="Allow the integration to deliver notifications into spaces."
				>
					<Switch
						checked={effectivePolicy.allowSpaces}
						onCheckedChange={(checked) =>
							void handlePolicyChange({ allowSpaces: checked })
						}
					/>
				</SettingRow>
				<SettingRow
					label="Require identity link"
					description="Only linked users can execute Google Chat issue actions."
				>
					<div className="flex items-center gap-3">
						<Switch
							checked={effectivePolicy.requireIdentityLink}
							onCheckedChange={(checked) =>
								void handlePolicyChange({ requireIdentityLink: checked })
							}
						/>
						<ShieldCheck className="h-4 w-4 text-muted-foreground" />
					</div>
				</SettingRow>
				<SettingRow
					label="Require action confirmation"
					description="When enabled, mutating issue actions are blocked in Google Chat and must be confirmed in Clave."
				>
					<Switch
						checked={effectivePolicy.requireActionConfirmation}
						onCheckedChange={(checked) =>
							void handlePolicyChange({ requireActionConfirmation: checked })
						}
					/>
				</SettingRow>
				{ISSUE_ACTION_ALLOWLIST_OPTIONS.map((option) => (
					<SettingRow
						key={option.id}
						label={option.label}
						description={option.description}
					>
						<Switch
							checked={effectivePolicy.allowedIssueActionIds.includes(
								option.id,
							)}
							onCheckedChange={(checked) =>
								toggleIssueActionAllowlist(option.id, checked)
							}
						/>
					</SettingRow>
				))}
			</SettingSection>

			<GoogleChatSubscriptionsPane />
		</div>
	);
}
