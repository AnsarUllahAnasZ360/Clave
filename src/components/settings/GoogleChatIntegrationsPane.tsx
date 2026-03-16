"use client";

import {
	CaretDown,
	ChatCircleText,
	Copy,
	Lock,
	Plug,
	ShieldCheck,
	Trash,
	UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { KeyRound, Store } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
		label: "Self-assign issues",
		description:
			"Users can assign issues to themselves from Google Chat cards.",
	},
	{
		id: "set_status_non_destructive",
		label: "Update issue status",
		description:
			"Users can move issues to triage, backlog, todo, in progress, or in review.",
	},
	{
		id: "open_issue_link",
		label: "Open in Clave",
		description: "Cards include a link to open the issue in Clave.",
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
			marketplaceProjectNumber?: string;
			marketplaceInstallId?: string;
			credentialSource?: "marketplace" | "byosa" | "global";
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
		encryptedCredentials?: string;
		credentialSource?: "marketplace" | "byosa" | "global";
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

const listWorkspaceLinksRef = makeFunctionReference<
	"query",
	{ workspaceId: Id<"workspaces">; provider?: "google-chat" },
	Array<{
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
	}>
>("chatIdentityLinks:listWorkspaceLinks");

const unlinkRef = makeFunctionReference<
	"mutation",
	{
		workspaceId: Id<"workspaces">;
		provider?: "google-chat";
		userId?: Id<"users">;
		chatUserId?: string;
	},
	null
>("chatIdentityLinks:unlink");

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

	const identityLinks = useQuery(
		listWorkspaceLinksRef,
		workspace && isAdmin
			? {
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
				}
			: "skip",
	);
	const unlinkMutation = useMutation(unlinkRef);

	const [appName, setAppName] = useState("");
	const [audience, setAudience] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [serviceAccountJson, setServiceAccountJson] = useState("");
	const [isValidatingCreds, setIsValidatingCreds] = useState(false);

	const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === "true";

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

	const handleByosaConnect = useCallback(async () => {
		if (!workspace || !serviceAccountJson.trim()) return;
		setIsValidatingCreds(true);
		try {
			const res = await fetch("/api/google-chat/encrypt-credentials", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					serviceAccountJson: serviceAccountJson.trim(),
				}),
			});
			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? "Failed to validate credentials");
				return;
			}
			await connect({
				workspaceId: workspace.workspaceId,
				provider: "google-chat",
				webhookUrl: webhookEndpoint,
				externalAppName: appName.trim() || undefined,
				authAudience: audience.trim() || undefined,
				encryptedCredentials: data.encryptedCredentials,
				credentialSource: "byosa",
			});
			setServiceAccountJson("");
			toast.success("Google Chat connected with custom service account");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to connect Google Chat",
			);
		} finally {
			setIsValidatingCreds(false);
		}
	}, [
		workspace,
		connect,
		webhookEndpoint,
		appName,
		audience,
		serviceAccountJson,
	]);

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

	const handleCopyWebhookUrl = useCallback(() => {
		void navigator.clipboard.writeText(webhookEndpoint);
		toast.success("Webhook URL copied");
	}, [webhookEndpoint]);

	const handleUnlinkUser = useCallback(
		async (userId: Id<"users">) => {
			if (!workspace) return;
			try {
				await unlinkMutation({
					workspaceId: workspace.workspaceId,
					provider: "google-chat",
					userId,
				});
				toast.success("Identity link removed");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to remove identity link",
				);
			}
		},
		[workspace, unlinkMutation],
	);

	const memberNameMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const member of members ?? []) {
			map.set(
				member.userId,
				member.user?.name ?? member.user?.email ?? "Unknown",
			);
		}
		return map;
	}, [members]);

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
					Connect Google Chat to receive notifications, take actions on issues,
					and use the Clave AI assistant directly from chat.
				</PaneDescription>
			</div>

			<SettingSection title="Connection">
				{!isConnected ? (
					<div className="space-y-4">
						{/* Option 1: Marketplace */}
						<div className="rounded-lg border border-sienna-500/30 bg-sienna-500/5 px-4 py-4 space-y-2">
							<p className="text-sm text-foreground font-medium flex items-center gap-2">
								<Store className="h-4 w-4 text-sienna-500" />
								Install from Google Workspace Marketplace
							</p>
							<p className="text-xs text-muted-foreground">
								The fastest way to set up — install the Clave app from the
								Marketplace and it auto-configures everything.
							</p>
							<a
								href="https://workspace.google.com/marketplace"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-xs text-sienna-500 hover:text-sienna-400 transition-colors font-medium"
							>
								Open Google Workspace Marketplace
								<span aria-hidden="true">&rarr;</span>
							</a>
						</div>

						<div className="flex items-center gap-3 text-xs text-muted-foreground">
							<div className="h-px flex-1 bg-border" />
							<span>or use your own service account</span>
							<div className="h-px flex-1 bg-border" />
						</div>

						{/* Option 2: BYOSA (Bring Your Own Service Account) */}
						<div className="rounded-lg border border-border bg-muted/30 px-4 py-4 space-y-3">
							<p className="text-sm text-foreground font-medium flex items-center gap-2">
								<KeyRound className="h-4 w-4 text-muted-foreground" />
								Custom service account
							</p>
							<ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed">
								<li>Create a Google Chat app in the Google Cloud Console</li>
								<li>Create a service account and download the JSON key</li>
								<li>Set the webhook URL to the endpoint shown below</li>
								<li>Paste the service account JSON below and connect</li>
							</ol>
						</div>

						<SettingRow
							label="Webhook URL"
							description="Set this as the HTTP endpoint in your Google Chat app configuration."
						>
							<div className="flex items-center gap-2">
								<div className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground truncate">
									{webhookEndpoint}
								</div>
								<Button
									variant="outline"
									size="icon"
									className="shrink-0 h-9 w-9"
									onClick={handleCopyWebhookUrl}
								>
									<Copy className="h-3.5 w-3.5" />
								</Button>
							</div>
						</SettingRow>

						<SettingRow
							label="Service account JSON"
							description="Paste your GCP service account key file contents. The credentials are encrypted before storage."
						>
							<Textarea
								placeholder='{"type": "service_account", "client_email": "...", ...}'
								value={serviceAccountJson}
								onChange={(event) => setServiceAccountJson(event.target.value)}
								rows={4}
								className="font-mono text-xs"
							/>
						</SettingRow>

						<Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
								>
									<CaretDown
										className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-0" : "-rotate-90"}`}
									/>
									Advanced settings
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-3 space-y-4">
								<SettingRow
									label="App display name"
									description="Optional label for this connection."
								>
									<Input
										placeholder="Clave"
										value={appName}
										onChange={(event) => setAppName(event.target.value)}
									/>
								</SettingRow>
								<SettingRow
									label="Auth audience"
									description="Expected OIDC audience claim for verifying inbound webhook tokens."
								>
									<Input
										placeholder={webhookEndpoint}
										value={audience}
										onChange={(event) => setAudience(event.target.value)}
									/>
								</SettingRow>
							</CollapsibleContent>
						</Collapsible>

						<Button
							onClick={handleByosaConnect}
							disabled={
								isValidatingCreds ||
								isSubmitting ||
								!workspace ||
								!serviceAccountJson.trim()
							}
							className="inline-flex items-center gap-2"
						>
							<KeyRound className="h-4 w-4" />
							{isValidatingCreds
								? "Validating..."
								: "Connect with service account"}
						</Button>

						{/* Dev mode: bare connect using global GOOGLE_CHAT_CREDENTIALS env var */}
						{isDevMode && (
							<>
								<div className="flex items-center gap-3 text-xs text-muted-foreground">
									<div className="h-px flex-1 bg-border" />
									<span>or connect with global credentials (dev only)</span>
									<div className="h-px flex-1 bg-border" />
								</div>
								<Button
									variant="outline"
									onClick={handleConnect}
									disabled={isSubmitting || !workspace}
									className="inline-flex items-center gap-2"
								>
									<ChatCircleText className="h-4 w-4" />
									Connect Google Chat
								</Button>
							</>
						)}
					</div>
				) : (
					<div className="space-y-4">
						<SettingRow
							label="Status"
							description="The integration is active and receiving events."
						>
							<div className="flex items-center gap-2">
								<span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-400">
									<Plug className="h-3.5 w-3.5" />
									Connected
								</span>
								{(connection?.credentialSource === "marketplace" ||
									connection?.marketplaceProjectNumber) && (
									<span className="inline-flex items-center gap-1 rounded-md border border-sienna-500/40 bg-sienna-500/10 px-2 py-1 text-xs text-sienna-500">
										<Store className="h-3 w-3" />
										Marketplace
									</span>
								)}
								{connection?.credentialSource === "byosa" && (
									<span className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-400">
										<KeyRound className="h-3 w-3" />
										Custom SA
									</span>
								)}
								{connection?.credentialSource === "global" && (
									<span className="inline-flex items-center gap-1 rounded-md border border-neutral-500/40 bg-neutral-500/10 px-2 py-1 text-xs text-neutral-400">
										Global
									</span>
								)}
							</div>
						</SettingRow>

						<SettingRow
							label="Webhook URL"
							description="The endpoint receiving Google Chat events."
						>
							<div className="flex items-center gap-2">
								<div className="flex-1 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground truncate">
									{webhookEndpoint}
								</div>
								<Button
									variant="outline"
									size="icon"
									className="shrink-0 h-9 w-9"
									onClick={handleCopyWebhookUrl}
								>
									<Copy className="h-3.5 w-3.5" />
								</Button>
							</div>
						</SettingRow>

						<Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
								>
									<CaretDown
										className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? "rotate-0" : "-rotate-90"}`}
									/>
									Advanced settings
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-3 space-y-4">
								<SettingRow
									label="App display name"
									description="Optional label for this connection."
								>
									<Input
										placeholder="Clave"
										value={appName}
										onChange={(event) => setAppName(event.target.value)}
									/>
								</SettingRow>
								<SettingRow
									label="Auth audience"
									description="Expected OIDC audience claim for verifying inbound webhook tokens."
								>
									<Input
										placeholder={webhookEndpoint}
										value={audience}
										onChange={(event) => setAudience(event.target.value)}
									/>
								</SettingRow>
								<Button
									variant="outline"
									size="sm"
									onClick={handleConnect}
									disabled={isSubmitting}
								>
									Update connection
								</Button>
							</CollapsibleContent>
						</Collapsible>

						<Button
							variant="outline"
							onClick={handleDisconnect}
							disabled={isSubmitting || !workspace}
						>
							Disconnect
						</Button>
					</div>
				)}
			</SettingSection>

			{isConnected && (
				<>
					<SettingSection title="Messaging policy">
						<SettingRow
							label="Enable integration"
							description="Pause all Google Chat activity for this workspace without disconnecting."
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
							description="Let team members interact with Clave AI in DMs."
						>
							<Switch
								checked={effectivePolicy.allowDirectMessages}
								onCheckedChange={(checked) =>
									void handlePolicyChange({
										allowDirectMessages: checked,
									})
								}
							/>
						</SettingRow>
						<SettingRow
							label="Allow spaces"
							description="Let Clave post notifications and respond to mentions in spaces."
						>
							<Switch
								checked={effectivePolicy.allowSpaces}
								onCheckedChange={(checked) =>
									void handlePolicyChange({
										allowSpaces: checked,
									})
								}
							/>
						</SettingRow>
						<SettingRow
							label="Require identity link"
							description="Only users who have linked their Google Chat identity can take actions on issues."
						>
							<div className="flex items-center gap-3">
								<Switch
									checked={effectivePolicy.requireIdentityLink}
									onCheckedChange={(checked) =>
										void handlePolicyChange({
											requireIdentityLink: checked,
										})
									}
								/>
								<ShieldCheck className="h-4 w-4 text-muted-foreground" />
							</div>
						</SettingRow>
						<SettingRow
							label="Require action confirmation"
							description="Mutating actions (assign, status change) must be confirmed in Clave before executing."
						>
							<Switch
								checked={effectivePolicy.requireActionConfirmation}
								onCheckedChange={(checked) =>
									void handlePolicyChange({
										requireActionConfirmation: checked,
									})
								}
							/>
						</SettingRow>
					</SettingSection>

					<SettingSection title="Allowed issue actions">
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

					<SettingSection title="Identity links">
						<p className="text-xs text-muted-foreground">
							Users who have linked their Google Chat identity to their Clave
							account. Links can be created by users in their personal settings
							or by admins here.
						</p>
						{identityLinks && identityLinks.length > 0 ? (
							<div className="space-y-2">
								{identityLinks.map((link) => (
									<div
										key={link._id}
										className="flex items-center justify-between rounded-lg border border-border bg-card/70 px-3 py-2.5"
									>
										<div className="flex items-center gap-3 min-w-0">
											<UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
											<div className="min-w-0">
												<p className="text-sm text-foreground truncate">
													{memberNameMap.get(link.userId) ?? "Unknown user"}
												</p>
												<p className="text-xs text-muted-foreground truncate">
													{link.chatDisplayName ?? link.chatUserId}
													{link.chatEmail ? ` (${link.chatEmail})` : ""}
												</p>
											</div>
										</div>
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
											onClick={() => void handleUnlinkUser(link.userId)}
										>
											<Trash className="h-3.5 w-3.5" />
										</Button>
									</div>
								))}
							</div>
						) : (
							<p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
								No identity links yet. Users can link their accounts from
								personal settings.
							</p>
						)}
					</SettingSection>
				</>
			)}
		</div>
	);
}
