"use client";

import {
	CircleNotch,
	CopySimple,
	EnvelopeSimple,
	Plus,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useAction, useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { PaneDescription, PaneTitle } from "./settings-shared";
export function TeammatesSettingsPane() {
	const workspace = useWorkspaceOptional();
	const members = useWorkspaceMembers();
	const currentUser = useCurrentUser();
	const generateInviteCode = useMutation(api.inviteCodes.generate);
	const sendInviteEmailAction = useAction(api.inviteCodes.sendInviteEmail);
	const removeMember = useMutation(api.workspaceMembers.remove);
	const updateRole = useMutation(api.workspaceMembers.updateRole);

	const [inviteCode, setInviteCode] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
	const [isSendingEmail, setIsSendingEmail] = useState(false);
	const [removingUserId, setRemovingUserId] = useState<string | null>(null);
	const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(
		null,
	);

	// Check if current user is admin
	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	// Sort: admins first, then alphabetically by name
	const sortedMembers = [...(members ?? [])].sort((a, b) => {
		if (a.role === "admin" && b.role !== "admin") return -1;
		if (a.role !== "admin" && b.role === "admin") return 1;
		const nameA = a.user?.name ?? "";
		const nameB = b.user?.name ?? "";
		return nameA.localeCompare(nameB);
	});

	const handleGenerateCode = useCallback(async () => {
		if (!workspace) return;
		setIsGenerating(true);
		try {
			const code = await generateInviteCode({
				workspaceId: workspace.workspaceId,
				expiresInHours: 7 * 24, // 7 days
			});
			setInviteCode(code);
			toast.success("Invite code generated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to generate code",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [workspace, generateInviteCode]);

	const handleCopyCode = useCallback(async () => {
		if (!inviteCode) return;
		try {
			await navigator.clipboard.writeText(inviteCode);
			toast.success("Invite code copied to clipboard");
		} catch {
			toast.error("Failed to copy invite code");
		}
	}, [inviteCode]);

	const handleCopyLink = useCallback(async () => {
		if (!inviteCode) return;
		try {
			const link = `${window.location.origin}/join?invite=${inviteCode}`;
			await navigator.clipboard.writeText(link);
			toast.success("Invite link copied to clipboard");
		} catch {
			toast.error("Failed to copy invite link");
		}
	}, [inviteCode]);

	const handleSendInviteEmail = useCallback(async () => {
		if (!workspace || !inviteEmail.trim()) return;
		setIsSendingEmail(true);
		try {
			const code = await generateInviteCode({
				workspaceId: workspace.workspaceId,
				role: inviteRole,
				expiresInHours: 7 * 24,
			});
			await sendInviteEmailAction({
				email: inviteEmail.trim(),
				inviteCode: code,
				workspaceName: workspace.workspaceName ?? "Workspace",
				inviterName: currentUser?.name ?? "A teammate",
				role: inviteRole,
			});
			setInviteEmail("");
			setInviteRole("member");
			toast.success(`Invite sent to ${inviteEmail.trim()}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to send invite email",
			);
		} finally {
			setIsSendingEmail(false);
		}
	}, [workspace, inviteEmail, inviteRole, currentUser, generateInviteCode, sendInviteEmailAction]);

	const handleRemoveMember = useCallback(
		async (userId: string) => {
			if (!workspace) return;
			try {
				await removeMember({
					workspaceId: workspace.workspaceId,
					userId: userId as Parameters<typeof removeMember>[0]["userId"],
				});
				toast.success("Member removed");
				setRemovingUserId(null);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to remove member",
				);
			}
		},
		[workspace, removeMember],
	);

	const handleChangeRole = useCallback(
		async (userId: string, newRole: "admin" | "member") => {
			if (!workspace) return;
			try {
				await updateRole({
					workspaceId: workspace.workspaceId,
					userId: userId as Parameters<typeof updateRole>[0]["userId"],
					role: newRole,
				});
				toast.success(`Role updated to ${newRole}`);
				setChangingRoleUserId(null);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to change role",
				);
			}
		},
		[workspace, updateRole],
	);

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Teammates</PaneTitle>
				<PaneDescription className="mt-1">
					Invite and manage your teammates to collaborate. You can also{" "}
					<span className="text-primary underline underline-offset-4">
						set up AI agents
					</span>{" "}
					to work alongside your team.
				</PaneDescription>
			</div>

			<Separator />

			{isAdmin && (
				<div className="space-y-3">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
						{inviteCode ? (
							<div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
								<code className="flex-1 text-sm font-mono tracking-wider">
									{inviteCode}
								</code>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2"
									onClick={handleCopyCode}
								>
									<CopySimple className="h-4 w-4" />
								</Button>
							</div>
						) : (
							<p className="flex-1 text-sm text-muted-foreground">
								Generate an invite code to share with teammates.
							</p>
						)}
						<Button
							type="button"
							size="lg"
							className="sm:w-auto rounded-lg"
							onClick={handleGenerateCode}
							disabled={isGenerating}
						>
							{isGenerating ? (
								<>
									<CircleNotch className="mr-1 h-4 w-4 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<Plus className="mr-1 h-4 w-4" />
									Generate invite code
								</>
							)}
						</Button>
					</div>
					{inviteCode && (
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								className="h-7 gap-1.5 text-xs"
								onClick={handleCopyLink}
							>
								<CopySimple className="h-3.5 w-3.5" />
								Copy invite link
							</Button>
							<p className="text-xs text-muted-foreground">
								Expires in 7 days.
							</p>
						</div>
					)}

					<Separator />

					<div className="flex flex-col gap-2">
						<p className="text-sm font-medium">Invite by email</p>
						<div className="flex gap-2">
							<Input
								type="email"
								placeholder="teammate@company.com"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSendInviteEmail();
								}}
								className="flex-1"
							/>
							<Select
								value={inviteRole}
								onValueChange={(val: string) =>
									setInviteRole(val as "admin" | "member")
								}
							>
								<SelectTrigger className="w-28">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="member">Member</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
							<Button
								onClick={handleSendInviteEmail}
								disabled={isSendingEmail || !inviteEmail.trim()}
							>
								{isSendingEmail ? (
									<CircleNotch className="mr-1 h-4 w-4 animate-spin" />
								) : (
									<EnvelopeSimple className="mr-1 h-4 w-4" />
								)}
								Send invite
							</Button>
						</div>
					</div>
				</div>
			)}

			<div className="rounded-2xl border border-border">
				<div className="grid grid-cols-12 px-4 py-3 text-xs font-medium text-muted-foreground">
					<span className="col-span-5">Name</span>
					<span className="col-span-3">Status</span>
					<span className="col-span-2 text-right sm:text-left">Role</span>
					{isAdmin && <span className="col-span-2 text-right">Actions</span>}
				</div>
				<div className="divide-y divide-border">
					{!members && (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							Loading...
						</div>
					)}
					{sortedMembers.map((mate) => {
						const initials = mate.user?.name
							? mate.user.name
									.split(" ")
									.map((n) => n[0])
									.join("")
									.toUpperCase()
									.slice(0, 2)
							: "?";
						const isSelf = mate.userId === currentUser?._id;

						return (
							<div
								key={mate._id}
								className="grid grid-cols-12 items-center px-4 py-4"
							>
								<div className="col-span-5 flex items-center gap-3">
									<Avatar className="h-9 w-9">
										<AvatarImage
											src={mate.user?.avatarUrl ?? mate.user?.image ?? ""}
										/>
										<AvatarFallback>{initials}</AvatarFallback>
									</Avatar>
									<div className="flex flex-col">
										<span className="text-sm font-medium text-foreground">
											{mate.user?.name ?? "Unknown"}
											{isSelf && (
												<span className="ml-1 text-xs text-muted-foreground">
													(you)
												</span>
											)}
										</span>
										<span className="text-xs text-muted-foreground">
											{mate.user?.email ?? ""}
										</span>
									</div>
								</div>
								<div className="col-span-3 text-sm text-muted-foreground">
									Active
								</div>
								<div className="col-span-2 text-right sm:text-left">
									{isAdmin && !isSelf && changingRoleUserId === mate._id ? (
										<Select
											value={mate.role}
											onValueChange={(val: string) =>
												handleChangeRole(mate.userId, val as "admin" | "member")
											}
										>
											<SelectTrigger className="h-7 w-24 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="admin">Admin</SelectItem>
												<SelectItem value="member">Member</SelectItem>
											</SelectContent>
										</Select>
									) : (
										<button
											type="button"
											className={cn(
												"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
												mate.role === "admin"
													? "bg-primary/10 text-primary"
													: "bg-muted text-muted-foreground",
												isAdmin && !isSelf && "cursor-pointer hover:opacity-80",
											)}
											onClick={() => {
												if (isAdmin && !isSelf) {
													setChangingRoleUserId(mate._id);
												}
											}}
											disabled={!isAdmin || isSelf}
										>
											{mate.role === "admin" ? "Admin" : "Member"}
										</button>
									)}
								</div>
								{isAdmin && (
									<div className="col-span-2 text-right">
										{!isSelf &&
											(removingUserId === mate._id ? (
												<div className="flex items-center justify-end gap-1">
													<Button
														variant="destructive"
														size="sm"
														className="h-6 px-2 text-xs"
														onClick={() => handleRemoveMember(mate.userId)}
													>
														Confirm
													</Button>
													<Button
														variant="ghost"
														size="sm"
														className="h-6 px-2 text-xs"
														onClick={() => setRemovingUserId(null)}
													>
														Cancel
													</Button>
												</div>
											) : (
												<Button
													variant="ghost"
													size="sm"
													className="h-7 px-2 text-muted-foreground hover:text-destructive"
													onClick={() => setRemovingUserId(mate._id)}
												>
													<TrashSimple className="h-4 w-4" />
												</Button>
											))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
