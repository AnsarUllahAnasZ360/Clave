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
import { useRouter, useSearchParams } from "next/navigation";
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
};

export function GitHubConnectionCard({ projectId }: GitHubConnectionCardProps) {
	const { workspaceId, workspaceSlug, orgSlug } = useWorkspace();
	const searchParams = useSearchParams();
	const router = useRouter();

	const connection = useQuery(api.github.getConnection, { projectId });
	const storeConnection = useMutation(api.github.storeConnection);
	const triggerInitialIndex = useMutation(api.github.triggerInitialIndex);
	const disconnectRepo = useMutation(api.github.disconnectRepo);

	const [repoOwner, setRepoOwner] = useState("");
	const [repoName, setRepoName] = useState("");
	const [isConnecting, setIsConnecting] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);
	const [showConnectForm, setShowConnectForm] = useState(false);

	// Handle OAuth callback redirect — store the connection in Convex
	const hasProcessedCallback = useRef(false);
	useEffect(() => {
		const githubConnect = searchParams.get("github_connect");
		if (!githubConnect || hasProcessedCallback.current) return;
		hasProcessedCallback.current = true;

		if (githubConnect === "success") {
			const params = {
				repo_owner: searchParams.get("repo_owner"),
				repo_name: searchParams.get("repo_name"),
				default_branch: searchParams.get("default_branch"),
				encrypted_token: searchParams.get("encrypted_token"),
				token_type: searchParams.get("token_type"),
				scope: searchParams.get("scope"),
			};

			if (
				params.repo_owner &&
				params.repo_name &&
				params.default_branch &&
				params.encrypted_token
			) {
				storeConnection({
					workspaceId,
					projectId,
					repoOwner: params.repo_owner,
					repoName: params.repo_name,
					defaultBranch: params.default_branch,
					encryptedToken: params.encrypted_token,
					tokenType: params.token_type ?? "bearer",
					scope: params.scope ?? "repo",
				})
					.then((connectionId) => {
						toast.success("GitHub repository connected — indexing started");
						// Trigger initial code indexing in the background
						triggerInitialIndex({ connectionId, projectId }).catch(
							(err: unknown) => {
								console.error("Failed to trigger indexing:", err);
							},
						);
					})
					.catch((error) => {
						toast.error(
							error instanceof Error
								? error.message
								: "Failed to store GitHub connection",
						);
					})
					.finally(() => {
						// Clean up URL params
						const url = new URL(window.location.href);
						for (const key of [
							"github_connect",
							"repo_owner",
							"repo_name",
							"default_branch",
							"encrypted_token",
							"token_type",
							"scope",
						]) {
							url.searchParams.delete(key);
						}
						router.replace((url.pathname + url.search) as never);
					});
			}
		} else if (githubConnect === "error") {
			const error = searchParams.get("github_error") ?? "Unknown error";
			toast.error(`GitHub connection failed: ${error}`);
			// Clean up URL params
			const url = new URL(window.location.href);
			url.searchParams.delete("github_connect");
			url.searchParams.delete("github_error");
			router.replace((url.pathname + url.search) as never);
		}
	}, [
		searchParams,
		storeConnection,
		triggerInitialIndex,
		workspaceId,
		projectId,
		router,
	]);

	const handleConnect = useCallback(() => {
		if (!repoOwner.trim() || !repoName.trim()) {
			toast.error("Please enter the repository owner and name");
			return;
		}
		setIsConnecting(true);

		const params = new URLSearchParams({
			projectId,
			workspaceId,
			orgSlug,
			workspaceSlug,
			repoOwner: repoOwner.trim(),
			repoName: repoName.trim(),
		});

		// Navigate to the authorize endpoint which redirects to GitHub
		window.location.href = `/api/auth/github/authorize?${params.toString()}`;
	}, [repoOwner, repoName, projectId, workspaceId, orgSlug, workspaceSlug]);

	const handleDisconnect = useCallback(async () => {
		if (!connection) return;
		setIsDisconnecting(true);
		try {
			await disconnectRepo({ connectionId: connection._id });
			toast.success("GitHub repository disconnected");
			setShowConnectForm(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to disconnect repository",
			);
		} finally {
			setIsDisconnecting(false);
		}
	}, [connection, disconnectRepo]);

	const handleReconnect = useCallback(() => {
		if (!connection) return;
		setRepoOwner(connection.repoOwner);
		setRepoName(connection.repoName);

		const params = new URLSearchParams({
			projectId,
			workspaceId,
			orgSlug,
			workspaceSlug,
			repoOwner: connection.repoOwner,
			repoName: connection.repoName,
		});

		window.location.href = `/api/auth/github/authorize?${params.toString()}`;
	}, [connection, projectId, workspaceId, orgSlug, workspaceSlug]);

	// Loading state
	if (connection === undefined) {
		return (
			<div className="rounded-lg border border-border bg-card p-4">
				<div className="flex items-center gap-2">
					<GithubLogo className="h-5 w-5 text-muted-foreground" />
					<span className="text-sm text-muted-foreground">Loading...</span>
				</div>
			</div>
		);
	}

	// Connected state
	if (connection) {
		const repoUrl = `https://github.com/${connection.repoOwner}/${connection.repoName}`;
		const isError = connection.status === "error";

		return (
			<div
				className={cn(
					"rounded-lg border bg-card p-4 space-y-3",
					isError ? "border-destructive/50" : "border-border",
				)}
			>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2.5">
						<GithubLogo className="h-5 w-5" weight="fill" />
						<div>
							<a
								href={repoUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm font-medium hover:underline inline-flex items-center gap-1"
							>
								{connection.repoOwner}/{connection.repoName}
								<ArrowSquareOut className="h-3 w-3 text-muted-foreground" />
							</a>
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<GitBranch className="h-3 w-3" />
								{connection.defaultBranch}
								{connection.lastSyncAt && (
									<>
										<span className="mx-1">·</span>
										Last synced{" "}
										{new Date(connection.lastSyncAt).toLocaleDateString()}
									</>
								)}
							</div>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{isError && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleReconnect}
								className="text-xs"
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
										<CircleNotch className="h-4 w-4 animate-spin" />
									) : (
										<LinkBreak className="h-4 w-4 text-muted-foreground" />
									)}
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Disconnect repository?</AlertDialogTitle>
									<AlertDialogDescription>
										This will remove the connection to{" "}
										<strong>
											{connection.repoOwner}/{connection.repoName}
										</strong>
										. Any indexed code will remain in search until re-indexed.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancel</AlertDialogCancel>
									<AlertDialogAction onClick={handleDisconnect}>
										Disconnect
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
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

				{!isError && (
					<div className="flex items-center gap-1.5">
						<div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						<span className="text-xs text-muted-foreground">Connected</span>
					</div>
				)}
			</div>
		);
	}

	// Not connected state
	return (
		<div className="rounded-lg border border-border bg-card p-4 space-y-3">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<GithubLogo className="h-5 w-5 text-muted-foreground" />
					<div>
						<p className="text-sm font-medium">GitHub Repository</p>
						<p className="text-xs text-muted-foreground">
							Connect a repository to enable code search and indexing.
						</p>
					</div>
				</div>
				{!showConnectForm && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowConnectForm(true)}
						className="text-xs"
					>
						Connect
					</Button>
				)}
			</div>

			{showConnectForm && (
				<div className="space-y-3 pt-1">
					<div className="flex gap-2">
						<Input
							placeholder="Owner (e.g. octocat)"
							value={repoOwner}
							onChange={(e) => setRepoOwner(e.target.value)}
							className="h-8 text-sm"
						/>
						<span className="flex items-center text-muted-foreground">/</span>
						<Input
							placeholder="Repository (e.g. hello-world)"
							value={repoName}
							onChange={(e) => setRepoName(e.target.value)}
							className="h-8 text-sm"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							onClick={handleConnect}
							disabled={isConnecting || !repoOwner.trim() || !repoName.trim()}
							className="text-xs"
						>
							{isConnecting ? (
								<>
									<CircleNotch className="h-3.5 w-3.5 animate-spin mr-1.5" />
									Redirecting to GitHub...
								</>
							) : (
								<>
									<GithubLogo className="h-3.5 w-3.5 mr-1.5" />
									Authorize & Connect
								</>
							)}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => {
								setShowConnectForm(false);
								setRepoOwner("");
								setRepoName("");
							}}
							className="text-xs"
						>
							Cancel
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
