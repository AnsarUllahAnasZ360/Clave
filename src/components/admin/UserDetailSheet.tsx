"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function roleBadgeVariant(role: string) {
	switch (role) {
		case "owner":
			return "default" as const;
		case "admin":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

interface UserDetailSheetProps {
	userId: Id<"users"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function UserDetailSheet({
	userId,
	open,
	onOpenChange,
}: UserDetailSheetProps) {
	const router = useRouter();
	const detail = useQuery(
		api.admin.getUserDetail,
		userId ? { userId } : "skip",
	);
	const currentUser = useQuery(api.users.current);
	const suspendUserMut = useMutation(api.admin.suspendUser);
	const unsuspendUserMut = useMutation(api.admin.unsuspendUser);
	const updateUserRoleMut = useMutation(api.admin.updateUserRole);
	const updateUserProfileMut = useMutation(api.admin.updateUserProfile);
	const removeUserMut = useMutation(api.admin.removeUser);
	const openUserContextMut = useMutation(api.admin.openUserContext);
	const openOrganizationContextMut = useMutation(
		api.admin.openOrganizationContext,
	);

	const [confirmAction, setConfirmAction] = useState<
		"suspend" | "unsuspend" | "promote" | "demote" | "remove" | null
	>(null);
	const [editedName, setEditedName] = useState("");
	const [isSavingProfile, setIsSavingProfile] = useState(false);
	const [isOpeningContext, setIsOpeningContext] = useState(false);

	const isSelf = currentUser?._id === userId;

	useEffect(() => {
		if (!detail) return;
		setEditedName(detail.name ?? "");
	}, [detail]);

	const handleConfirmAction = useCallback(async () => {
		if (!userId || !confirmAction) return;
		try {
			switch (confirmAction) {
				case "suspend":
					await suspendUserMut({ userId });
					toast.success("User suspended");
					break;
				case "unsuspend":
					await unsuspendUserMut({ userId });
					toast.success("User unsuspended");
					break;
				case "promote":
					await updateUserRoleMut({ userId, role: "superadmin" });
					toast.success("User promoted to superadmin");
					break;
				case "demote":
					await updateUserRoleMut({ userId, role: null });
					toast.success("Superadmin role removed");
					break;
				case "remove":
					await removeUserMut({ userId });
					toast.success("User removed from active platform access");
					onOpenChange(false);
					break;
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update user",
			);
		} finally {
			setConfirmAction(null);
		}
	}, [
		userId,
		confirmAction,
		suspendUserMut,
		unsuspendUserMut,
		updateUserRoleMut,
		removeUserMut,
		onOpenChange,
	]);

	const handleSaveProfile = useCallback(async () => {
		if (!userId || !detail) return;
		const normalizedCurrentName = detail.name ?? "";
		const normalizedEditedName = editedName.trim();
		if (normalizedCurrentName === normalizedEditedName) return;

		setIsSavingProfile(true);
		try {
			await updateUserProfileMut({
				userId,
				name: normalizedEditedName,
			});
			toast.success("Profile updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to save profile",
			);
		} finally {
			setIsSavingProfile(false);
		}
	}, [userId, detail, editedName, updateUserProfileMut]);

	const handleOpenUserContext = useCallback(async () => {
		if (!userId) return;
		setIsOpeningContext(true);
		try {
			const destination = await openUserContextMut({ userId });
			toast.success("Opened user organization context");
			onOpenChange(false);
			router.push(destination.path as Parameters<typeof router.push>[0]);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to open user context",
			);
		} finally {
			setIsOpeningContext(false);
		}
	}, [userId, openUserContextMut, onOpenChange, router]);

	const handleOpenOrganization = useCallback(
		async (organizationId: Id<"organizations">) => {
			try {
				const destination = await openOrganizationContextMut({
					organizationId,
				});
				toast.success("Opened organization");
				onOpenChange(false);
				router.push(destination.path as Parameters<typeof router.push>[0]);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to open organization context",
				);
			}
		},
		[openOrganizationContextMut, onOpenChange, router],
	);

	const confirmDialogConfig = {
		suspend: {
			title: "Suspend User",
			description:
				"Are you sure you want to suspend this user? They will lose access to the platform until unsuspended.",
			actionLabel: "Suspend",
			variant: "destructive" as const,
		},
		unsuspend: {
			title: "Unsuspend User",
			description:
				"Are you sure you want to unsuspend this user? They will regain access to the platform.",
			actionLabel: "Unsuspend",
			variant: "default" as const,
		},
		promote: {
			title: "Promote to Superadmin",
			description:
				"Are you sure you want to promote this user to superadmin? They will have full platform management access.",
			actionLabel: "Promote",
			variant: "default" as const,
		},
		demote: {
			title: "Remove Superadmin Role",
			description:
				"Are you sure you want to remove superadmin access from this user? They will lose platform management abilities.",
			actionLabel: "Remove",
			variant: "destructive" as const,
		},
		remove: {
			title: "Remove User",
			description:
				"Remove this user from active platform access and strip memberships? This action suspends the account and clears org/workspace access.",
			actionLabel: "Remove User",
			variant: "destructive" as const,
		},
	};

	const activeConfig = confirmAction
		? confirmDialogConfig[confirmAction]
		: null;

	return (
		<>
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
					{detail === undefined ? (
						<SheetHeader>
							<Skeleton className="h-6 w-48" />
							<Skeleton className="h-4 w-32" />
						</SheetHeader>
					) : (
						<>
							<SheetHeader>
								<div className="flex items-center gap-3">
									<Avatar className="h-10 w-10">
										{detail.image && (
											<AvatarImage src={detail.image} alt={detail.name ?? ""} />
										)}
										<AvatarFallback>
											{getInitials(detail.name ?? detail.email ?? "?")}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<SheetTitle>{detail.name ?? "Unnamed"}</SheetTitle>
										<SheetDescription>
											{detail.email ?? "No email"}
										</SheetDescription>
									</div>
								</div>
								<div className="flex items-center gap-2 pt-2">
									{detail.role === "superadmin" ? (
										<Badge variant="default">Superadmin</Badge>
									) : (
										<Badge variant="outline">Regular</Badge>
									)}
									{detail.suspended ? (
										<Badge variant="destructive">Suspended</Badge>
									) : (
										<Badge variant="outline">Active</Badge>
									)}
								</div>
								{detail.lastActiveAt && (
									<p className="text-sm text-muted-foreground pt-1">
										Last active {formatRelativeTime(detail.lastActiveAt)}
									</p>
								)}
							</SheetHeader>

							<div className="space-y-2 px-4">
								<Label htmlFor="admin-user-name">Display name</Label>
								<div className="flex items-center gap-2">
									<Input
										id="admin-user-name"
										value={editedName}
										onChange={(event) => setEditedName(event.target.value)}
										placeholder="No display name"
									/>
									<Button
										variant="outline"
										size="sm"
										disabled={
											isSavingProfile ||
											(detail.name ?? "") === editedName.trim()
										}
										onClick={handleSaveProfile}
									>
										{isSavingProfile ? "Saving..." : "Save"}
									</Button>
								</div>
							</div>

							{/* Actions */}
							<div className="flex flex-wrap items-center gap-3 px-4">
								<Button
									size="sm"
									disabled={isOpeningContext}
									onClick={handleOpenUserContext}
								>
									{isOpeningContext ? "Opening..." : "Open User Context"}
								</Button>
								{detail.suspended ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setConfirmAction("unsuspend")}
									>
										Unsuspend
									</Button>
								) : (
									<Button
										variant="destructive"
										size="sm"
										disabled={isSelf}
										onClick={() => setConfirmAction("suspend")}
									>
										Suspend
									</Button>
								)}
								{detail.role === "superadmin" ? (
									<Button
										variant="outline"
										size="sm"
										onClick={() => setConfirmAction("demote")}
									>
										Remove Superadmin
									</Button>
								) : (
									<Button
										variant="outline"
										size="sm"
										disabled={detail.suspended}
										onClick={() => setConfirmAction("promote")}
									>
										Promote to Superadmin
									</Button>
								)}
								<Button
									variant="destructive"
									size="sm"
									disabled={isSelf}
									onClick={() => setConfirmAction("remove")}
								>
									Remove User
								</Button>
							</div>

							{/* Tabs */}
							<div className="px-4 pb-4 flex-1">
								<Tabs defaultValue="organizations">
									<TabsList>
										<TabsTrigger value="organizations">
											Organizations ({detail.organizations.length})
										</TabsTrigger>
										<TabsTrigger value="workspaces">
											Workspaces ({detail.workspaces.length})
										</TabsTrigger>
									</TabsList>

									<TabsContent value="organizations" className="mt-4">
										{detail.organizations.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												No organizations
											</p>
										) : (
											<div className="space-y-2">
												{detail.organizations.map((org) => (
													<div
														key={org._id}
														className="flex items-center justify-between rounded-md border px-3 py-2"
													>
														<div>
															<p className="text-sm font-medium">{org.name}</p>
															<p className="text-xs text-muted-foreground">
																/{org.slug}
															</p>
														</div>
														<div className="flex items-center gap-2">
															<Badge
																variant={roleBadgeVariant(org.role)}
																className="capitalize shrink-0"
															>
																{org.role}
															</Badge>
															<Button
																variant="ghost"
																size="sm"
																onClick={() =>
																	void handleOpenOrganization(org._id)
																}
															>
																Open
															</Button>
														</div>
													</div>
												))}
											</div>
										)}
									</TabsContent>

									<TabsContent value="workspaces" className="mt-4">
										{detail.workspaces.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												No workspaces
											</p>
										) : (
											<div className="space-y-2">
												{detail.workspaces.map((ws) => (
													<div
														key={ws._id}
														className="flex items-center justify-between rounded-md border px-3 py-2"
													>
														<div>
															<p className="text-sm font-medium">{ws.name}</p>
															<p className="text-xs text-muted-foreground">
																/{ws.slug}
															</p>
														</div>
														<Badge
															variant={roleBadgeVariant(ws.role)}
															className="capitalize shrink-0"
														>
															{ws.role}
														</Badge>
													</div>
												))}
											</div>
										)}
									</TabsContent>
								</Tabs>
							</div>
						</>
					)}
				</SheetContent>
			</Sheet>

			{/* Confirmation Dialog */}
			<AlertDialog
				open={confirmAction !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{activeConfig?.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{activeConfig?.description}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant={activeConfig?.variant}
							onClick={handleConfirmAction}
						>
							{activeConfig?.actionLabel}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
