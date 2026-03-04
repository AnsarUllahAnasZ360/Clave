"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { GitBranch, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type CreateBranchDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: Id<"projects">;
	issueId: Id<"issues">;
	identifier: string;
	title: string;
};

function slugify(text: string, maxLength = 60): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-{2,}/g, "-")
		.slice(0, maxLength)
		.replace(/-$/, "");
}

export function CreateBranchDialog({
	open,
	onOpenChange,
	projectId,
	issueId,
	identifier,
	title,
}: CreateBranchDialogProps) {
	const connections = useQuery(
		api.github.getProjectConnections,
		open ? { projectId } : "skip",
	);
	const listBranchesAction = useAction(api.githubSyncActions.listBranches);
	const createBranchAction = useAction(api.githubSyncActions.createBranch);
	const updateIssue = useMutation(api.issues.update);

	// Stable refs for actions to avoid stale closures
	const actionsRef = useRef({ listBranches: listBranchesAction, createBranch: createBranchAction });
	actionsRef.current = { listBranches: listBranchesAction, createBranch: createBranchAction };

	const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
	const [branches, setBranches] = useState<Array<{ name: string; isDefault: boolean }>>([]);
	const [baseBranch, setBaseBranch] = useState("");
	const [branchName, setBranchName] = useState("");
	const [isLoadingBranches, setIsLoadingBranches] = useState(false);
	const [isCreating, setIsCreating] = useState(false);
	const [branchError, setBranchError] = useState<string | null>(null);

	// Track if we already fetched for this connection to avoid duplicate fetches
	const fetchedForRef = useRef<string>("");

	const fetchBranches = useCallback(async (connectionId: string) => {
		if (!connectionId) return;
		console.log("[CreateBranch] fetchBranches called for:", connectionId);
		setBranches([]);
		setBaseBranch("");
		setBranchError(null);
		setIsLoadingBranches(true);
		fetchedForRef.current = connectionId;

		try {
			const result = await actionsRef.current.listBranches({
				connectionId: connectionId as Id<"githubConnections">,
			});
			console.log("[CreateBranch] listBranches returned:", result.length, "branches");
			// Only apply if we're still looking at the same connection
			if (fetchedForRef.current !== connectionId) {
				console.log("[CreateBranch] Stale response, ignoring");
				return;
			}
			setBranches(result);
			const defaultBranch = result.find((b) => b.isDefault);
			if (defaultBranch) {
				setBaseBranch(defaultBranch.name);
				console.log("[CreateBranch] Set base branch:", defaultBranch.name);
			} else if (result.length > 0) {
				setBaseBranch(result[0].name);
				console.log("[CreateBranch] Set base branch (first):", result[0].name);
			}
		} catch (err) {
			if (fetchedForRef.current !== connectionId) return;
			console.error("[CreateBranch] Failed to fetch branches:", err);
			setBranchError("Failed to load branches from GitHub");
		} finally {
			if (fetchedForRef.current === connectionId) {
				setIsLoadingBranches(false);
				console.log("[CreateBranch] Loading done");
			}
		}
	}, []);

	// When connections load, auto-select and fetch branches (use most recent active only)
	useEffect(() => {
		if (!open || !connections || connections.length === 0) return;

		const activeConns = connections
			.filter((c) => c.status === "active")
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
		if (activeConns.length === 0) return;

		// Auto-select most recent active connection and fetch branches
		if (!selectedConnectionId) {
			const firstId = activeConns[0]._id;
			setSelectedConnectionId(firstId);
			setBranchName(`feat/${slugify(`${identifier}-${title}`)}`);
			fetchBranches(firstId);
		}
	}, [open, connections, selectedConnectionId, identifier, title, fetchBranches]);

	// When user changes connection in dropdown
	const handleConnectionChange = useCallback(
		(connectionId: string) => {
			setSelectedConnectionId(connectionId);
			fetchBranches(connectionId);
		},
		[fetchBranches],
	);

	// Reset state when dialog closes
	useEffect(() => {
		if (!open) {
			setSelectedConnectionId("");
			setBranches([]);
			setBaseBranch("");
			setBranchName("");
			setIsLoadingBranches(false);
			setIsCreating(false);
			setBranchError(null);
			fetchedForRef.current = "";
		}
	}, [open]);

	const handleCreate = useCallback(async () => {
		console.log("[CreateBranch] handleCreate called", {
			selectedConnectionId,
			baseBranch,
			branchName: branchName.trim(),
		});
		if (!selectedConnectionId || !baseBranch || !branchName.trim()) {
			console.log("[CreateBranch] Missing required fields, aborting");
			return;
		}

		setIsCreating(true);
		try {
			console.log("[CreateBranch] Calling createBranch action...");
			const result = await actionsRef.current.createBranch({
				connectionId: selectedConnectionId as Id<"githubConnections">,
				branchName: branchName.trim(),
				baseBranch,
			});
			console.log("[CreateBranch] createBranch result:", result);

			if (result.success) {
				console.log("[CreateBranch] Success! Updating issue...");
				await updateIssue({
					issueId,
					gitBranchName: branchName.trim(),
				});
				toast.success(`Branch "${branchName.trim()}" created on GitHub`);
				onOpenChange(false);
			} else {
				console.log("[CreateBranch] Failed:", result.error);
				toast.error(result.error ?? "Failed to create branch");
			}
		} catch (error) {
			console.error("[CreateBranch] Error:", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to create branch",
			);
		} finally {
			setIsCreating(false);
			console.log("[CreateBranch] Done, isCreating=false");
		}
	}, [selectedConnectionId, baseBranch, branchName, updateIssue, issueId, onOpenChange]);

	const activeConnections = connections
		?.filter((c) => c.status === "active")
		.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	const noConnections = connections !== undefined && (activeConnections?.length ?? 0) === 0;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GitBranch className="h-4 w-4" />
						Create branch
					</DialogTitle>
					<DialogDescription>
						Create a new branch on GitHub for {identifier}
					</DialogDescription>
				</DialogHeader>

				{noConnections ? (
					<p className="text-sm text-muted-foreground py-4 text-center">
						No GitHub repositories connected to this project. Connect a
						repository in project settings first.
					</p>
				) : (
					<div className="space-y-4 py-2">
						{/* Repository selector */}
						<div className="space-y-2">
							<Label>Repository</Label>
							{activeConnections && activeConnections.length > 1 ? (
								<Select
									value={selectedConnectionId}
									onValueChange={handleConnectionChange}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select repository" />
									</SelectTrigger>
									<SelectContent>
										{activeConnections.map((conn) => (
											<SelectItem key={conn._id} value={conn._id}>
												{conn.repoOwner}/{conn.repoName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : activeConnections && activeConnections.length === 1 ? (
								<p className="text-sm font-mono bg-muted/50 rounded-md px-3 py-2">
									{activeConnections[0].repoOwner}/
									{activeConnections[0].repoName}
								</p>
							) : (
								<div className="h-9 rounded-md bg-muted/50 animate-pulse" />
							)}
						</div>

						{/* Base branch selector */}
						<div className="space-y-2">
							<Label>Base branch</Label>
							{isLoadingBranches ? (
								<div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2">
									<Loader2 className="h-3.5 w-3.5 animate-spin" />
									Loading branches...
								</div>
							) : branchError ? (
								<div className="text-sm text-destructive px-3 py-2">
									{branchError}
									<Button
										variant="link"
										size="sm"
										className="ml-2 h-auto p-0 text-xs"
										onClick={() => fetchBranches(selectedConnectionId)}
									>
										Retry
									</Button>
								</div>
							) : branches.length > 0 ? (
								<Select value={baseBranch} onValueChange={setBaseBranch}>
									<SelectTrigger>
										<SelectValue placeholder="Select base branch" />
									</SelectTrigger>
									<SelectContent>
										{branches.map((b) => (
											<SelectItem key={b.name} value={b.name}>
												{b.name}
												{b.isDefault ? " (default)" : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : selectedConnectionId ? (
								<p className="text-sm text-muted-foreground px-3 py-2">
									No branches found
								</p>
							) : null}
						</div>

						{/* Branch name input */}
						<div className="space-y-2">
							<Label>Branch name</Label>
							<Input
								value={branchName}
								onChange={(e) => setBranchName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !isCreating) handleCreate();
								}}
								placeholder="feat/my-feature"
								className="font-mono text-sm"
							/>
						</div>
					</div>
				)}

				<DialogFooter>
					<Button
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isCreating}
					>
						Cancel
					</Button>
					{!noConnections && (
						<Button
							onClick={handleCreate}
							disabled={
								isCreating ||
								!selectedConnectionId ||
								!baseBranch ||
								!branchName.trim()
							}
						>
							{isCreating ? (
								<>
									<Loader2 className="h-4 w-4 animate-spin mr-2" />
									Creating...
								</>
							) : (
								"Create branch"
							)}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
