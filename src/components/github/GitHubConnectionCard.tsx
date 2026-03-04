"use client";

import {
	ArrowSquareOut,
	CircleNotch,
	GitBranch,
	GithubLogo,
	LinkBreak,
	Warning,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspace } from "@/components/providers/workspace-context";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type GitHubConnectionCardProps = {
	projectId: Id<"projects">;
	projectSlug: string;
};

export function GitHubConnectionCard({ projectId, projectSlug }: GitHubConnectionCardProps) {
	const { workspaceId, workspaceSlug } = useWorkspace();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const connections = useQuery(api.github.getProjectConnections, {
		projectId,
	});
	const storeConnection = useMutation(api.github.storeConnection);
	const triggerInitialIndex = useMutation(api.github.triggerInitialIndex);
	const disconnectRepo = useMutation(api.github.disconnectRepo);

	const [repoUrl, setRepoUrl] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [disconnectingId, setDisconnectingId] = useState<Id<"githubConnections"> | null>(null);
	const [showConnectForm, setShowConnectForm] = useState(false);
	const [showPatFallback, setShowPatFallback] = useState(false);
	const [patToken, setPatToken] = useState("");

	// Handle OAuth callback redirect params
	const handledOAuthRef = useRef(false);
	useEffect(() => {
		if (handledOAuthRef.current) return;
		const githubConnect = searchParams.get("github_connect");
		if (!githubConnect) return;
		handledOAuthRef.current = true;

		// Clear URL params immediately
		const cleanUrl = pathname;
		router.replace(cleanUrl);

		if (githubConnect === "error") {
			const errorCode = searchParams.get("github_error") ?? "unknown";
			const messages: Record<string, string> = {
				server_not_configured: "GitHub OAuth is not configured on the server",
				token_exchange_failed: "Failed to exchange code for token",
				repo_not_found: "Repository not found or not accessible",
				repo_fetch_failed: "Failed to fetch repository info",
				encryption_failed: "Failed to secure token",
			};
			toast.error(messages[errorCode] ?? `GitHub connection failed: ${errorCode}`);
			return;
		}

		if (githubConnect === "success") {
			const repoOwner = searchParams.get("repo_owner");
			const repoName = searchParams.get("repo_name");
			const defaultBranch = searchParams.get("default_branch") ?? "main";
			const encryptedToken = searchParams.get("encrypted_token");
			const tokenType = searchParams.get("token_type") ?? "bearer";
			const scope = searchParams.get("scope") ?? "repo";

			if (!repoOwner || !repoName || !encryptedToken) {
				toast.error("Incomplete OAuth response from GitHub");
				return;
			}

			// Store connection via Convex
			storeConnection({
				workspaceId,
				projectId,
				repoOwner,
				repoName,
				defaultBranch,
				encryptedToken,
				tokenType,
				scope,
			})
				.then((connectionId) => {
					toast.success("GitHub repository connected — indexing started");
					triggerInitialIndex({ connectionId, projectId }).catch(
						(err: unknown) => {
							console.error("Failed to trigger indexing:", err);
						},
					);
				})
				.catch((err: unknown) => {
					const message =
						err instanceof Error ? err.message : "Failed to store connection";
					toast.error(message);
				});
		}
	}, [searchParams, pathname, router, storeConnection, triggerInitialIndex, workspaceId, projectId]);

	const parseGithubUrl = useCallback((url: string) => {
		const trimmed = url.trim().replace(/\/+$/, "");
		const match = trimmed.match(
			/(?:https?:\/\/)?github\.com\/([^/]+)\/([^/]+)/,
		);
		if (!match) return null;
		return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
	}, []);

	// OAuth connect — redirect to GitHub
	const handleOAuthConnect = useCallback(() => {
		const parsed = parseGithubUrl(repoUrl);
		if (!parsed) {
			toast.error(
				"Invalid GitHub URL. Use format: https://github.com/owner/repo",
			);
			return;
		}

		const params = new URLSearchParams({
			projectId,
			projectSlug,
			workspaceId,
			workspaceSlug,
			repoOwner: parsed.owner,
			repoName: parsed.repo,
		});

		window.location.href = `/api/github/oauth/authorize?${params.toString()}`;
	}, [repoUrl, parseGithubUrl, projectId, workspaceId, workspaceSlug]);

	// PAT fallback connect
	const handlePatConnect = useCallback(async () => {
		const parsed = parseGithubUrl(repoUrl);
		if (!parsed) {
			toast.error(
				"Invalid GitHub URL. Use format: https://github.com/owner/repo",
			);
			return;
		}
		if (!patToken.trim()) {
			toast.error("Please enter a Personal Access Token");
			return;
		}

		setIsConnecting(true);
		try {
			const response = await fetch("/api/auth/github/connect-pat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: patToken.trim(),
					repoOwner: parsed.owner,
					repoName: parsed.repo,
				}),
			});

			const data = await response.json();
			if (!response.ok) {
				toast.error(data.error ?? "Failed to validate token");
				return;
			}

			const connectionId = await storeConnection({
				workspaceId,
				projectId,
				repoOwner: data.repoOwner,
				repoName: data.repoName,
				defaultBranch: data.defaultBranch,
				encryptedToken: data.encryptedToken,
				tokenType: data.tokenType,
				scope: data.scope,
			});

			toast.success("GitHub repository connected — indexing started");
			setShowConnectForm(false);
			setShowPatFallback(false);
			setRepoUrl("");
			setPatToken("");

			triggerInitialIndex({ connectionId, projectId }).catch(
				(err: unknown) => {
					console.error("Failed to trigger indexing:", err);
				},
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to connect repository",
			);
		} finally {
			setIsConnecting(false);
		}
	}, [
		repoUrl,
		patToken,
		parseGithubUrl,
		storeConnection,
		triggerInitialIndex,
		workspaceId,
		projectId,
	]);

	const handleDisconnect = useCallback(
		async (connectionId: Id<"githubConnections">) => {
			setDisconnectingId(connectionId);
			try {
				await disconnectRepo({ connectionId });
				toast.success("GitHub repository disconnected");
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to disconnect repository",
				);
			} finally {
				setDisconnectingId(null);
			}
		},
		[disconnectRepo],
	);

	// Loading state
	if (connections === undefined) {
		return (
			<div className="rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-2">
					<GithubLogo className="h-5 w-5 text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	const activeConnections = connections.filter(
		(c) => c.status !== "disconnected",
	);
	const hasConnections = activeConnections.length > 0;

	return (
		<div className="rounded-lg border border-border bg-card p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<GithubLogo
						className="h-5 w-5 text-muted-foreground"
						weight={hasConnections ? "fill" : "regular"}
					/>
					<div>
						<p className="text-sm font-medium">GitHub Repositories</p>
						{!hasConnections && (
							<p className="text-xs text-muted-foreground">
								Connect repositories to enable code search and indexing.
							</p>
						)}
					</div>
				</div>
				{!showConnectForm && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowConnectForm(true)}
						className="text-xs"
					>
						{hasConnections ? "Add repository" : "Connect"}
					</Button>
				)}
			</div>

			{/* Connected repos list */}
			{activeConnections.map((conn) => {
				const connRepoUrl = `https://github.com/${conn.repoOwner}/${conn.repoName}`;
				const isError = conn.status === "error";
				const isDisconnecting = disconnectingId === conn._id;

				return (
					<div
						key={conn._id}
						className={cn(
							"rounded-md border p-3 space-y-2",
							isError ? "border-destructive/50" : "border-border/50",
						)}
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<GithubLogo className="h-4 w-4" weight="fill" />
								<a
									href={connRepoUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="text-sm font-medium hover:underline inline-flex items-center gap-1"
								>
									{conn.repoOwner}/{conn.repoName}
									<ArrowSquareOut className="h-3 w-3 text-muted-foreground" />
								</a>
							</div>

							<div className="flex items-center gap-2">
								{isError && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setShowConnectForm(true)}
										className="text-xs h-6"
									>
										Reconnect
									</Button>
								)}
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<Button
											variant="ghost"
											size="icon-sm"
											disabled={isDisconnecting}
											aria-label="Disconnect repository"
										>
											{isDisconnecting ? (
												<CircleNotch className="h-3.5 w-3.5 animate-spin" />
											) : (
												<LinkBreak className="h-3.5 w-3.5 text-muted-foreground" />
											)}
										</Button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												Disconnect repository?
											</AlertDialogTitle>
											<AlertDialogDescription>
												This will remove the connection to{" "}
												<strong>
													{conn.repoOwner}/{conn.repoName}
												</strong>
												. Any indexed code will remain in search until
												re-indexed.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												onClick={() => handleDisconnect(conn._id)}
											>
												Disconnect
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						</div>

						<div className="flex items-center gap-3 text-xs text-muted-foreground">
							<div className="flex items-center gap-1">
								<GitBranch className="h-3 w-3" />
								{conn.defaultBranch}
							</div>
							{conn.lastSyncAt && (
								<>
									<span>·</span>
									<span>
										Last synced{" "}
										{new Date(conn.lastSyncAt).toLocaleDateString()}
									</span>
								</>
							)}
							{!isError && (
								<div className="flex items-center gap-1">
									<div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
									<span>Connected</span>
								</div>
							)}
							{conn.issueSyncEnabled && (
								<span className="text-[10px] bg-muted/50 px-1.5 py-0.5 rounded">
									Issue sync on
								</span>
							)}
						</div>

						{isError && (
							<div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
								<Warning className="h-3.5 w-3.5 shrink-0" />
								<span>
									Connection error — the access token may have expired or been
									revoked.
								</span>
							</div>
						)}
					</div>
				);
			})}

			{/* Connect form */}
			{showConnectForm && (
				<div className="space-y-3 pt-1">
					<Input
						placeholder="https://github.com/owner/repository"
						value={repoUrl}
						onChange={(e) => setRepoUrl(e.target.value)}
						className="h-8 text-sm"
					/>

					{/* Primary: OAuth connect */}
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							onClick={handleOAuthConnect}
							disabled={!repoUrl.trim()}
							className="text-xs"
						>
							<GithubLogo className="h-3.5 w-3.5 mr-1.5" />
							Connect with GitHub
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowConnectForm(false);
								setShowPatFallback(false);
								setRepoUrl("");
								setPatToken("");
							}}
							className="text-xs"
						>
							Cancel
						</Button>
					</div>

					{/* Secondary: PAT fallback */}
					{!showPatFallback ? (
						<button
							type="button"
							onClick={() => setShowPatFallback(true)}
							className="text-[11px] text-muted-foreground hover:text-foreground underline"
						>
							Use a Personal Access Token instead
						</button>
					) : (
						<div className="space-y-3 border-t border-border/50 pt-3">
							<Input
								type="password"
								placeholder="Personal Access Token (ghp_...)"
								value={patToken}
								onChange={(e) => setPatToken(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handlePatConnect();
								}}
								className="h-8 text-sm font-mono"
							/>
							<p className="text-[11px] text-muted-foreground">
								Generate a token at{" "}
								<a
									href="https://github.com/settings/tokens/new?scopes=repo&description=Clave"
									target="_blank"
									rel="noopener noreferrer"
									className="underline hover:text-foreground"
								>
									github.com/settings/tokens
								</a>
								{" "}with{" "}
								<code className="text-[10px] bg-muted px-1 py-0.5 rounded">
									repo
								</code>{" "}
								scope.
							</p>
							<Button
								size="sm"
								variant="outline"
								onClick={handlePatConnect}
								disabled={isConnecting || !repoUrl.trim() || !patToken.trim()}
								className="text-xs"
							>
								{isConnecting ? (
									<>
										<CircleNotch className="h-3.5 w-3.5 animate-spin mr-1.5" />
										Connecting...
									</>
								) : (
									"Connect with token"
								)}
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
