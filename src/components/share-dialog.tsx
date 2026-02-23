"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Check,
	Copy,
	Globe,
	Link2,
	Lock,
	RefreshCw,
	Trash2,
	Users,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceMembers } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type ShareDialogProps = {
	entityType: "document" | "whiteboard";
	entityId: Id<"documents"> | Id<"whiteboards">;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	workspaceId: Id<"workspaces">;
};

const VISIBILITY_OPTIONS = [
	{
		value: "private" as const,
		label: "Private",
		description: "Only you and people you share with",
		icon: Lock,
	},
	{
		value: "workspace" as const,
		label: "Workspace",
		description: "Anyone in the workspace can view",
		icon: Users,
	},
	{
		value: "public" as const,
		label: "Public",
		description: "Anyone with the link can view",
		icon: Globe,
	},
];

const VISIBILITY_LABELS: Record<string, string> = {
	private: "Private",
	workspace: "Workspace",
	public: "Public",
};

function getEntityConfig(entityType: "document" | "whiteboard") {
	if (entityType === "document") {
		return {
			getShareSettings: api.documents.getShareSettings,
			updateShareSettings: api.documents.updateShareSettings,
			addShare: api.documents.addShare,
			removeShare: api.documents.removeShare,
			regenerateToken: api.documents.regenerateShareToken,
			idKey: "documentId" as const,
			shareLinkPath: "/share/",
			label: "document",
		};
	}
	return {
		getShareSettings: api.whiteboards.getShareSettings,
		updateShareSettings: api.whiteboards.updateShareSettings,
		addShare: api.whiteboards.addShare,
		removeShare: api.whiteboards.removeShare,
		regenerateToken: api.whiteboards.regenerateShareToken,
		idKey: "whiteboardId" as const,
		shareLinkPath: "/share/board/",
		label: "board",
	};
}

export function ShareDialog({
	entityType,
	entityId,
	open,
	onOpenChange,
	workspaceId,
}: ShareDialogProps) {
	const config = getEntityConfig(entityType);

	// Build the query args with the correct entity ID key
	// biome-ignore lint/suspicious/noExplicitAny: Dynamic entity routing requires flexible args
	const queryArgs = open ? ({ [config.idKey]: entityId } as any) : "skip";

	const shareSettings = useQuery(config.getShareSettings, queryArgs);
	const members = useWorkspaceMembers();
	const updateShareSettings = useMutation(config.updateShareSettings);
	const addShare = useMutation(config.addShare);
	const removeShare = useMutation(config.removeShare);
	const regenerateToken = useMutation(config.regenerateToken);

	const [copied, setCopied] = useState(false);
	const [addingUserId, setAddingUserId] = useState<string>("");

	// Helper to build entity-keyed args
	const entityArgs = useCallback(
		// biome-ignore lint/suspicious/noExplicitAny: Dynamic entity routing requires flexible args
		(extra: Record<string, unknown> = {}): any => {
			return { [config.idKey]: entityId, ...extra };
		},
		[config.idKey, entityId],
	);

	const handleVisibilityChange = useCallback(
		async (visibility: "private" | "workspace" | "public") => {
			try {
				await updateShareSettings(
					entityArgs({
						visibility,
						defaultPermission: shareSettings?.defaultPermission,
					}),
				);
				toast.success(`Access updated to ${VISIBILITY_LABELS[visibility]}`);
			} catch {
				toast.error("Failed to update sharing settings");
			}
		},
		[entityArgs, updateShareSettings, shareSettings?.defaultPermission],
	);

	const handleDefaultPermissionChange = useCallback(
		async (permission: "view" | "edit") => {
			if (!shareSettings) return;
			try {
				await updateShareSettings(
					entityArgs({
						visibility: shareSettings.visibility,
						defaultPermission: permission,
					}),
				);
			} catch {
				toast.error("Failed to update default permission");
			}
		},
		[entityArgs, updateShareSettings, shareSettings],
	);

	const handleCopyLink = useCallback(async () => {
		if (!shareSettings?.shareToken) return;
		try {
			const shareUrl = `${window.location.origin}${config.shareLinkPath}${shareSettings.shareToken}`;
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			toast.success("Share link copied");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy link");
		}
	}, [shareSettings?.shareToken, config.shareLinkPath]);

	const handleRegenerateToken = useCallback(async () => {
		try {
			await regenerateToken(entityArgs());
			toast.success("Share link regenerated — old links are now invalid");
		} catch {
			toast.error("Failed to regenerate link");
		}
	}, [entityArgs, regenerateToken]);

	const handleAddShare = useCallback(async () => {
		if (!addingUserId) return;
		try {
			await addShare(
				entityArgs({
					userId: addingUserId as Id<"users">,
					permission: "view",
				}),
			);
			setAddingUserId("");
			toast.success("User added");
		} catch {
			toast.error("Failed to add user");
		}
	}, [entityArgs, addingUserId, addShare]);

	const handleRemoveShare = useCallback(
		async (userId: Id<"users">) => {
			try {
				await removeShare(entityArgs({ userId }));
			} catch {
				toast.error("Failed to remove user");
			}
		},
		[entityArgs, removeShare],
	);

	const handleUpdateSharePermission = useCallback(
		async (userId: Id<"users">, permission: "view" | "edit") => {
			try {
				await addShare(entityArgs({ userId, permission }));
			} catch {
				toast.error("Failed to update permission");
			}
		},
		[entityArgs, addShare],
	);

	const visibility = shareSettings?.visibility ?? "private";
	const isShared = visibility !== "private";

	// Filter out members who already have shares
	const sharedUserIds = new Set(shareSettings?.shares.map((s) => s.userId));
	const availableMembers = (members ?? []).filter(
		(m) => !sharedUserIds.has(m.userId),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 p-0 overflow-hidden">
				<DialogHeader className="px-6 pt-6 pb-4">
					<DialogTitle className="text-base font-semibold">
						Share {config.label}
					</DialogTitle>
					<DialogDescription className="text-sm text-muted-foreground">
						Control who can access this {config.label}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pb-6 space-y-5 overflow-hidden">
					{/* Access level selector */}
					<div className="space-y-2.5">
						<span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
							Access level
						</span>
						<div className="rounded-lg border border-border overflow-hidden">
							{VISIBILITY_OPTIONS.map((option, idx) => {
								const Icon = option.icon;
								const isSelected = visibility === option.value;
								return (
									<button
										key={option.value}
										type="button"
										onClick={() => handleVisibilityChange(option.value)}
										className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
											isSelected ? "bg-primary/[0.06]" : "hover:bg-muted/50"
										} ${idx > 0 ? "border-t border-border" : ""}`}
									>
										<div
											className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
												isSelected
													? "bg-primary text-primary-foreground"
													: "bg-muted text-muted-foreground"
											}`}
										>
											<Icon className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div
												className={`text-sm leading-tight ${isSelected ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}
											>
												{option.label}
											</div>
											<div className="text-xs text-muted-foreground mt-0.5">
												{option.description}
											</div>
										</div>
										{isSelected && (
											<div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary shrink-0">
												<Check className="h-3 w-3 text-primary-foreground" />
											</div>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* Share link section */}
					{isShared && shareSettings?.shareToken && (
						<>
							<Separator />
							<div className="space-y-3">
								<div className="flex items-center gap-1.5">
									<Link2 className="h-3.5 w-3.5 text-muted-foreground" />
									<span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
										Share link
									</span>
								</div>

								{/* URL display */}
								<div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
									<span className="block truncate text-xs text-muted-foreground font-mono leading-none">
										{`${typeof window !== "undefined" ? window.location.origin : ""}${config.shareLinkPath}${shareSettings.shareToken}`}
									</span>
								</div>

								{/* Action buttons row */}
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={handleCopyLink}
										className="h-8 gap-1.5 px-3"
									>
										{copied ? (
											<Check className="h-3.5 w-3.5 text-emerald-500" />
										) : (
											<Copy className="h-3.5 w-3.5" />
										)}
										<span className="text-xs">
											{copied ? "Copied!" : "Copy link"}
										</span>
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={handleRegenerateToken}
										className="h-8 gap-1.5 px-3 text-muted-foreground"
									>
										<RefreshCw className="h-3.5 w-3.5" />
										<span className="text-xs">Regenerate</span>
									</Button>
								</div>

								{/* Default permission */}
								<div className="flex items-center justify-between">
									<span className="text-sm text-muted-foreground">
										Anyone with the link can
									</span>
									<Select
										value={shareSettings.defaultPermission}
										onValueChange={(v) =>
											handleDefaultPermissionChange(v as "view" | "edit")
										}
									>
										<SelectTrigger className="h-8 w-24 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent align="end">
											<SelectItem value="view">View</SelectItem>
											<SelectItem value="edit">Edit</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>
						</>
					)}

					{/* People with access */}
					<Separator />
					<div className="space-y-2.5">
						<span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
							People with access
						</span>

						{/* Add people */}
						{availableMembers.length > 0 && (
							<div className="flex items-center gap-2">
								<Select value={addingUserId} onValueChange={setAddingUserId}>
									<SelectTrigger className="h-9 flex-1 text-sm">
										<SelectValue placeholder="Add a person..." />
									</SelectTrigger>
									<SelectContent>
										{availableMembers.map((m) => (
											<SelectItem key={m.userId} value={m.userId}>
												{m.user?.name ?? m.user?.email ?? "Unknown"}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant="outline"
									size="sm"
									onClick={handleAddShare}
									disabled={!addingUserId}
									className="h-9 px-4"
								>
									Add
								</Button>
							</div>
						)}

						{/* Shared users list */}
						<div className="space-y-1">
							{(shareSettings?.shares ?? []).map((share) => (
								<div
									key={share._id}
									className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
								>
									<Avatar className="h-7 w-7 shrink-0">
										<AvatarImage src={share.userImage ?? undefined} />
										<AvatarFallback className="text-[11px]">
											{share.userName?.charAt(0)?.toUpperCase() ?? "?"}
										</AvatarFallback>
									</Avatar>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate">
											{share.userName}
										</div>
										<div className="text-xs text-muted-foreground truncate">
											{share.userEmail}
										</div>
									</div>
									<Select
										value={share.permission}
										onValueChange={(v) =>
											handleUpdateSharePermission(
												share.userId as Id<"users">,
												v as "view" | "edit",
											)
										}
									>
										<SelectTrigger className="h-7 w-20 text-xs shrink-0">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="view">View</SelectItem>
											<SelectItem value="edit">Edit</SelectItem>
										</SelectContent>
									</Select>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() =>
											handleRemoveShare(share.userId as Id<"users">)
										}
										className="text-muted-foreground hover:text-destructive shrink-0"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							))}
							{(shareSettings?.shares ?? []).length === 0 && (
								<p className="text-sm text-muted-foreground py-3 px-2">
									No individual shares yet
								</p>
							)}
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
