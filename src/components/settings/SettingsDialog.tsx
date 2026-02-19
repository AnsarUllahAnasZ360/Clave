"use client";

import {
	Bell,
	CheckCircle,
	Circle,
	CircleNotch,
	CopySimple,
	FileText,
	Info,
	PencilSimpleLine,
	Plus,
	Robot,
	ShieldCheck,
	SlidersHorizontal,
	Sparkle,
	Spinner,
	SquaresFour,
	Star,
	TrashSimple,
	UploadSimple,
	UserCircle,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
	getPriorityConfig,
	getStatusConfig,
	getTypeConfig,
} from "@/lib/issue-config";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function PaneTitle({
	className,
	children,
	...props
}: React.ComponentProps<"h2">) {
	return (
		<h2
			className={cn("text-lg leading-none font-semibold", className)}
			{...props}
		>
			{children}
		</h2>
	);
}

function PaneDescription({
	className,
	children,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground text-sm", className)} {...props}>
			{children}
		</p>
	);
}

export const settingsSections = [
	{
		id: "personal",
		label: "Personal",
		items: [
			{ id: "account", label: "Account" },
			{ id: "notifications", label: "Notifications" },
		],
	},
	{
		id: "workspace",
		label: "Workspace",
		items: [
			{ id: "identity", label: "Workspace" },
			{ id: "teammates", label: "Teammates" },
			{ id: "types", label: "Types" },
		],
	},
] as const;

export const settingsItemIcons: Record<
	string,
	React.ComponentType<{ className?: string }>
> = {
	account: UserCircle,
	notifications: Bell,
	teammates: UsersThree,
	identity: SlidersHorizontal,
	types: SquaresFour,
};

export type SettingsItemId =
	(typeof settingsSections)[number]["items"][number]["id"];

export function TeammatesSettingsPane() {
	const workspace = useWorkspaceOptional();
	const members = useQuery(
		api.workspaceMembers.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const currentUser = useQuery(api.users.current);
	const generateInviteCode = useMutation(api.inviteCodes.generate);
	const removeMember = useMutation(api.workspaceMembers.remove);
	const updateRole = useMutation(api.workspaceMembers.updateRole);

	const [inviteCode, setInviteCode] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
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
			const link = `${window.location.origin}/join?code=${inviteCode}`;
			await navigator.clipboard.writeText(link);
			toast.success("Invite link copied to clipboard");
		} catch {
			toast.error("Failed to copy invite link");
		}
	}, [inviteCode]);

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
					<Link href="#" className="text-primary underline underline-offset-4">
						set up AI agents
					</Link>{" "}
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

export function AccountSettingsPane() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const { theme, setTheme } = useTheme();
	const [isMounted, setIsMounted] = useState(false);

	const user = useQuery(api.users.current);
	const avatarUrl = useQuery(api.users.getAvatarUrl);
	const updateUser = useMutation(api.users.update);
	const generateUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
	const saveAvatar = useMutation(api.users.saveAvatar);

	const [nameValue, setNameValue] = useState("");
	const [roleValue, setRoleValue] = useState("");
	const [timezoneValue, setTimezoneValue] = useState("");

	// Sync form state from user query
	useEffect(() => {
		if (user) {
			setNameValue(user.name ?? "");
			setRoleValue(user.role ?? "");
			setTimezoneValue(
				user.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
			);
		}
	}, [user]);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	useEffect(() => {
		return () => {
			if (objectUrl) {
				URL.revokeObjectURL(objectUrl);
			}
		};
	}, [objectUrl]);

	const photoPreview = objectUrl ?? avatarUrl ?? user?.image ?? "";

	const handleRequestPhoto = () => {
		fileInputRef.current?.click();
	};

	const handlePhotoChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (file.size > 2 * 1024 * 1024) {
			toast.error("Image must be less than 2MB");
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error("File must be an image");
			return;
		}

		// Show preview immediately
		const nextUrl = URL.createObjectURL(file);
		setObjectUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return nextUrl;
		});

		// Upload to Convex
		setIsUploading(true);
		try {
			const uploadUrl = await generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			const { storageId } = await response.json();
			await saveAvatar({ storageId });
			toast.success("Avatar updated");
		} catch {
			toast.error("Failed to upload avatar");
		} finally {
			setIsUploading(false);
		}
	};

	const handleNameBlur = useCallback(async () => {
		if (!user || nameValue === (user.name ?? "")) return;
		if (nameValue.trim().length < 2) {
			toast.error("Name must be at least 2 characters");
			setNameValue(user.name ?? "");
			return;
		}
		try {
			await updateUser({ name: nameValue.trim() });
			toast.success("Name updated");
		} catch {
			toast.error("Failed to update name");
		}
	}, [user, nameValue, updateUser]);

	const handleRoleBlur = useCallback(async () => {
		if (!user || roleValue === (user.role ?? "")) return;
		if (roleValue.length > 100) {
			toast.error("Job title must be 100 characters or fewer");
			setRoleValue(user.role ?? "");
			return;
		}
		try {
			await updateUser({ role: roleValue.trim() });
			toast.success("Job title updated");
		} catch {
			toast.error("Failed to update job title");
		}
	}, [user, roleValue, updateUser]);

	const handleTimezoneChange = useCallback(
		async (value: string) => {
			setTimezoneValue(value);
			try {
				await updateUser({ timezone: value });
				toast.success("Timezone updated");
			} catch {
				toast.error("Failed to update timezone");
			}
		},
		[updateUser],
	);

	const handleThemeChange = useCallback(
		async (value: string) => {
			setTheme(value);
			try {
				await updateUser({
					theme: value as "light" | "dark" | "system",
				});
			} catch {
				toast.error("Failed to update theme");
			}
		},
		[setTheme, updateUser],
	);

	const timezones = (() => {
		try {
			return Intl.supportedValuesOf("timeZone");
		} catch {
			return [
				"UTC",
				"America/New_York",
				"America/Los_Angeles",
				"Europe/London",
				"Asia/Tokyo",
			];
		}
	})();

	const initials = user?.name
		? user.name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
				.slice(0, 2)
		: "?";

	if (!user) {
		return (
			<div className="space-y-8">
				<div>
					<PaneTitle className="text-xl">Account</PaneTitle>
					<PaneDescription className="mt-1">Loading...</PaneDescription>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Account</PaneTitle>
				<PaneDescription className="mt-1">
					Manage your personal information and account preferences.
				</PaneDescription>
			</div>

			<Separator />

			<SettingSection title="Information">
				{!user.avatarStorageId && (
					<div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4">
						<div className="flex-1 text-sm text-amber-200">
							<span className="font-medium">Profile picture required.</span>{" "}
							Upload a photo so your team can recognize you.
						</div>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-3 text-xs shrink-0 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
							onClick={handleRequestPhoto}
							disabled={isUploading}
						>
							Upload now
						</Button>
					</div>
				)}
				<SettingRow
					label="Profile photo"
					description="This image appears across your workspace."
				>
					<div className="flex flex-wrap items-center gap-4">
						<Avatar className="h-16 w-16">
							<AvatarImage src={photoPreview} />
							<AvatarFallback>{initials}</AvatarFallback>
						</Avatar>
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								className="h-8 px-3 text-xs"
								onClick={handleRequestPhoto}
								disabled={isUploading}
							>
								{isUploading ? (
									<>
										<Spinner className="mr-1 h-3 w-3 animate-spin" />
										Uploading...
									</>
								) : (
									"Change photo"
								)}
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handlePhotoChange}
								aria-label="Upload profile photo"
							/>
						</div>
					</div>
				</SettingRow>
				<SettingRow label="Full name">
					<Input
						value={nameValue}
						onChange={(e) => setNameValue(e.target.value)}
						onBlur={handleNameBlur}
						className="h-9 text-sm"
					/>
				</SettingRow>
				<SettingRow
					label="Email address"
					description="Notifications will be sent to this address."
				>
					<Input
						value={user.email ?? ""}
						type="email"
						className="h-9 text-sm"
						readOnly
					/>
				</SettingRow>
				<SettingRow label="Job title">
					<Input
						value={roleValue}
						onChange={(e) => setRoleValue(e.target.value)}
						onBlur={handleRoleBlur}
						placeholder="e.g. Designer, Engineer"
						className="h-9 text-sm"
					/>
				</SettingRow>
			</SettingSection>

			<Separator />

			<SettingSection title="Appearance">
				<SettingRow label="Theme">
					<Select
						value={isMounted ? (theme ?? "system") : "system"}
						onValueChange={handleThemeChange}
					>
						<SelectTrigger className="h-9 text-sm">
							<SelectValue placeholder="Select theme" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="system">System default</SelectItem>
							<SelectItem value="light">Light</SelectItem>
							<SelectItem value="dark">Dark</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
				<SettingRow
					label="Compact mode"
					description="Use a more compact layout for the interface."
				>
					<Switch
						checked={user.compactMode ?? false}
						onCheckedChange={async (checked) => {
							try {
								await updateUser({ compactMode: checked });
							} catch {
								toast.error("Failed to update compact mode");
							}
						}}
					/>
				</SettingRow>
				<SettingRow
					label="Sidebar collapsed"
					description="Start with the sidebar collapsed by default."
				>
					<Switch
						checked={user.sidebarCollapsed ?? false}
						onCheckedChange={async (checked) => {
							try {
								await updateUser({ sidebarCollapsed: checked });
							} catch {
								toast.error("Failed to update sidebar preference");
							}
						}}
					/>
				</SettingRow>
			</SettingSection>

			<Separator />

			<SettingSection title="Location and time">
				<SettingRow label="Timezone">
					<Select value={timezoneValue} onValueChange={handleTimezoneChange}>
						<SelectTrigger className="h-9 text-sm">
							<SelectValue placeholder="Select timezone" />
						</SelectTrigger>
						<SelectContent>
							{timezones.map((tz) => (
								<SelectItem key={tz} value={tz}>
									{tz.replace(/_/g, " ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>

			<Separator />

			<SettingSection title="Authentication">
				<SettingRow
					label="User ID"
					description="Share this ID if you contact support."
				>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Input value={user._id} readOnly className="font-mono text-sm" />
						<Button
							variant="ghost"
							size="icon-sm"
							className="shrink-0"
							onClick={() => {
								navigator.clipboard.writeText(user._id);
								toast.success("User ID copied");
							}}
						>
							<CopySimple className="h-4 w-4" />
						</Button>
					</div>
				</SettingRow>
			</SettingSection>
		</div>
	);
}

export function IdentitySettingsPane() {
	const workspace = useWorkspaceOptional();
	const currentUser = useQuery(api.users.current);
	const members = useQuery(
		api.workspaceMembers.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const logoUrl = useQuery(
		api.workspaces.getLogoUrl,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);
	const workspaceData = useQuery(
		api.workspaces.getBySlug,
		workspace ? { slug: workspace.workspaceSlug } : "skip",
	);
	const updateWorkspace = useMutation(api.workspaces.update);
	const generateLogoUploadUrl = useMutation(
		api.workspaces.generateLogoUploadUrl,
	);

	const logoInputRef = useRef<HTMLInputElement | null>(null);
	const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);

	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [descValue, setDescValue] = useState("");
	const [copied, setCopied] = useState(false);

	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	// Sync form state from workspace data
	useEffect(() => {
		if (workspaceData) {
			setNameValue(workspaceData.name);
			setSlugValue(workspaceData.slug);
			setDescValue(workspaceData.description ?? "");
		}
	}, [workspaceData]);

	useEffect(() => {
		return () => {
			if (logoObjectUrl) {
				URL.revokeObjectURL(logoObjectUrl);
			}
		};
	}, [logoObjectUrl]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(t);
	}, [copied]);

	const handleCopyId = async () => {
		if (!workspace) return;
		try {
			await navigator.clipboard.writeText(workspace.workspaceId);
			setCopied(true);
			toast.success("Workspace ID copied");
		} catch {
			toast.error("Failed to copy");
		}
	};

	const logoPreview = logoObjectUrl ?? logoUrl ?? "";

	const handleNameBlur = useCallback(async () => {
		if (!workspace || !workspaceData || nameValue === workspaceData.name)
			return;
		if (nameValue.trim().length < 2) {
			toast.error("Workspace name must be at least 2 characters");
			setNameValue(workspaceData.name);
			return;
		}
		try {
			await updateWorkspace({
				workspaceId: workspace.workspaceId,
				name: nameValue.trim(),
			});
			toast.success("Workspace name updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update name",
			);
			setNameValue(workspaceData.name);
		}
	}, [workspace, workspaceData, nameValue, updateWorkspace]);

	const handleSlugBlur = useCallback(async () => {
		if (!workspace || !workspaceData || slugValue === workspaceData.slug)
			return;
		const normalized = slugValue
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		if (normalized.length < 2) {
			toast.error("Slug must be at least 2 characters");
			setSlugValue(workspaceData.slug);
			return;
		}
		try {
			await updateWorkspace({
				workspaceId: workspace.workspaceId,
				slug: normalized,
			});
			setSlugValue(normalized);
			toast.success(
				"Workspace slug updated. Bookmarks using the old URL will no longer work.",
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update slug",
			);
			setSlugValue(workspaceData.slug);
		}
	}, [workspace, workspaceData, slugValue, updateWorkspace]);

	const handleDescBlur = useCallback(async () => {
		if (
			!workspace ||
			!workspaceData ||
			descValue === (workspaceData.description ?? "")
		)
			return;
		try {
			await updateWorkspace({
				workspaceId: workspace.workspaceId,
				description: descValue.trim(),
			});
			toast.success("Description updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update description",
			);
		}
	}, [workspace, workspaceData, descValue, updateWorkspace]);

	const handleLogoChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file || !workspace) return;

		if (file.size > 2 * 1024 * 1024) {
			toast.error("Image must be less than 2MB");
			return;
		}
		if (!file.type.startsWith("image/")) {
			toast.error("File must be an image");
			return;
		}

		const nextUrl = URL.createObjectURL(file);
		setLogoObjectUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return nextUrl;
		});

		setIsUploadingLogo(true);
		try {
			const uploadUrl = await generateLogoUploadUrl({
				workspaceId: workspace.workspaceId,
			});
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});
			const { storageId } = await response.json();
			await updateWorkspace({
				workspaceId: workspace.workspaceId,
				logoStorageId: storageId,
			});
			toast.success("Logo updated");
		} catch {
			toast.error("Failed to upload logo");
		} finally {
			setIsUploadingLogo(false);
		}
	};

	if (!workspaceData) {
		return (
			<div className="space-y-8">
				<div>
					<PaneTitle className="text-xl">Workspace configuration</PaneTitle>
					<PaneDescription className="mt-1">Loading...</PaneDescription>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Workspace configuration</PaneTitle>
				<PaneDescription className="mt-1">
					Manage your workspace identity, branding, and configuration.
				</PaneDescription>
			</div>

			<Separator />

			<SettingSection title="Workspace logo">
				<div className="flex flex-wrap items-center gap-4">
					<div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
						{logoPreview ? (
							<img
								src={logoPreview}
								alt="Workspace"
								className="h-full w-full object-cover"
							/>
						) : (
							<span className="text-2xl font-bold text-muted-foreground">
								{nameValue?.[0]?.toUpperCase() ?? "W"}
							</span>
						)}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-3 text-xs"
							onClick={() => logoInputRef.current?.click()}
							disabled={!isAdmin || isUploadingLogo}
						>
							{isUploadingLogo ? (
								<>
									<CircleNotch className="mr-1 h-3 w-3 animate-spin" />
									Uploading...
								</>
							) : (
								"Change logo"
							)}
						</Button>
						<input
							ref={logoInputRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={handleLogoChange}
							aria-label="Upload workspace logo"
						/>
						<span className="text-xs text-muted-foreground">
							Max 2MB, image files only
						</span>
					</div>
				</div>
			</SettingSection>

			<SettingSection title="Workspace details">
				<SettingRow
					label="Name"
					description="The display name for your workspace."
				>
					<Input
						value={nameValue}
						onChange={(e) => setNameValue(e.target.value)}
						onBlur={handleNameBlur}
						className="max-w-xs"
						disabled={!isAdmin}
					/>
				</SettingRow>

				<SettingRow
					label="URL slug"
					description="Used in your workspace URL. Changing this will break existing bookmarks."
				>
					<div className="flex items-center gap-1.5 max-w-xs">
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							goclave.app/
						</span>
						<Input
							value={slugValue}
							onChange={(e) =>
								setSlugValue(
									e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
								)
							}
							onBlur={handleSlugBlur}
							className="flex-1"
							disabled={!isAdmin}
						/>
					</div>
				</SettingRow>

				<SettingRow
					label="Description"
					description="A short description for your workspace."
				>
					<textarea
						value={descValue}
						onChange={(e) => setDescValue(e.target.value)}
						onBlur={handleDescBlur}
						className="min-h-[80px] w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!isAdmin}
						placeholder="What does your team work on?"
					/>
				</SettingRow>

				<SettingRow
					label="Workspace ID"
					description="Use this ID when connecting integrations."
				>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center max-w-xs">
						<Input
							readOnly
							value={workspace?.workspaceId ?? ""}
							className="font-mono text-sm"
						/>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="gap-2"
							onClick={handleCopyId}
						>
							<CopySimple className="h-4 w-4" />
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
				</SettingRow>
			</SettingSection>
		</div>
	);
}

export function BillingSettingsPane() {
	const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">(
		"monthly",
	);

	const plans = [
		{
			id: "personal",
			name: "Personal",
			price: "$0",
			period: "per teammate per month",
			badge: null as string | null,
			highlight: true,
			ctaLabel: "Current plan",
		},
		{
			id: "premium",
			name: "Premium",
			price: "$8",
			period: "per teammate per month",
			badge: "-20%",
			highlight: false,
			ctaLabel: "Upgrade",
		},
		{
			id: "business",
			name: "Business",
			price: "$12",
			period: "per teammate per month",
			badge: "-20%",
			highlight: false,
			ctaLabel: "Upgrade",
		},
	] as const;

	const features = [
		{
			id: "teammates",
			label: "Teammates",
			values: ["Up to 4", "Unlimited", "Unlimited"],
		},
		{
			id: "tasks",
			label: "Tasks",
			values: ["Unlimited", "Unlimited", "Unlimited"],
		},
		{
			id: "docs",
			label: "Docs",
			values: ["Unlimited", "Unlimited", "Unlimited"],
		},
		{
			id: "storage",
			label: "Storage",
			values: ["Unlimited", "Unlimited", "Unlimited"],
		},
		{
			id: "ai-model",
			label: "AI model usage",
			values: ["Unlimited", "Unlimited", "Unlimited"],
		},
		{
			id: "ai-agents",
			label: "AI agents",
			values: [false, true, true],
		},
		{
			id: "ai-execution",
			label: "AI task execution",
			values: [false, true, true],
		},
		{
			id: "ai-reporting",
			label: "AI reporting",
			values: [false, true, true],
		},
		{
			id: "ai-filling",
			label: "AI task property filling",
			values: [false, true, true],
		},
	] as const;

	const renderValue = (value: string | boolean) => {
		if (typeof value === "string") {
			return <span className="text-sm text-foreground">{value}</span>;
		}
		if (value) {
			return <CheckCircle className="h-4 w-4 text-emerald-500" weight="fill" />;
		}
		return <span className="text-sm text-muted-foreground">—</span>;
	};

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Plans and billing</PaneTitle>
				<PaneDescription className="mt-1">
					Manage your subscription and billing preferences. Review your current
					plan, compare features, and adjust your plan as your team grows.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-5">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-center gap-3 text-sm">
						<span className="font-medium text-foreground">Billing period</span>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span
								className={cn(
									"font-medium",
									billingPeriod === "monthly" && "text-primary",
								)}
							>
								Monthly
							</span>
							<Switch
								checked={billingPeriod === "annual"}
								onCheckedChange={(checked) =>
									setBillingPeriod(checked ? "annual" : "monthly")
								}
							/>
							<span
								className={cn(
									"font-medium",
									billingPeriod === "annual" && "text-primary",
								)}
							>
								Annually
							</span>
						</div>
					</div>
				</div>

				<div className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/60">
					<div className="grid grid-cols-4 border-b border-border bg-muted/40 px-4 py-4 text-sm font-semibold text-foreground">
						<div></div>
						{plans.map((plan) => (
							<div key={plan.id} className="px-3">
								<div className="flex items-center gap-2">
									<span>{plan.name}</span>
									{plan.badge && (
										<span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
											{plan.badge}
										</span>
									)}
								</div>
								<div className="mt-2 flex items-baseline gap-1">
									<span className="text-2xl font-semibold">{plan.price}</span>
									<span className="text-xs text-muted-foreground">
										{plan.period}
									</span>
								</div>
								<div className="mt-3">
									<Button
										variant={plan.highlight ? "outline" : "outline"}
										size="sm"
										className={cn(
											"h-8 w-full text-xs",
											plan.highlight
												? "border-primary/60 bg-primary/10 text-primary"
												: "border-border bg-transparent text-foreground",
										)}
									>
										{plan.ctaLabel}
									</Button>
								</div>
							</div>
						))}
					</div>

					<div className="divide-y divide-border/80 text-xs">
						{features.map((feature) => (
							<div
								key={feature.id}
								className="grid grid-cols-4 items-center px-4 py-3"
							>
								<div className="pr-4 text-sm text-foreground">
									{feature.label}
								</div>
								{feature.values.map((val, index) => (
									<div
										key={index}
										className="flex items-center justify-center border-l border-border/70 px-3 text-center"
									>
										{renderValue(val)}
									</div>
								))}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

export function ImportSettingsPane() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const steps = [
		{ id: 1, label: "Upload" },
		{ id: 2, label: "Select header" },
		{ id: 3, label: "Map columns" },
		{ id: 4, label: "Import" },
	] as const;
	const [activeStep, setActiveStep] = useState<(typeof steps)[number]["id"]>(1);
	const [headerRow, setHeaderRow] = useState(1);
	const [importStatus, setImportStatus] = useState<"idle" | "running" | "done">(
		"idle",
	);
	const [importProgress, setImportProgress] = useState(0);
	const [uploadedFile, setUploadedFile] = useState<{
		name: string;
		size: string;
		type: string;
	} | null>(null);

	const columns = [
		{ name: "ID", required: false },
		{ name: "Title", required: true },
		{ name: "Board", required: false },
		{ name: "Status", required: false },
		{ name: "Description", required: false },
		{ name: "Parent ID", required: false },
		{ name: "Assignee emails", required: false },
		{ name: "Tags", required: false },
		{ name: "Priority", required: false },
	] as const;

	const previewRows = [
		{ id: 1, cells: ["Task Name", "Status", "Owner", "Due Date", "Priority"] },
		{
			id: 2,
			cells: [
				"Finalize onboarding flow",
				"In progress",
				"Liam",
				"2026-02-10",
				"High",
			],
		},
		{
			id: 3,
			cells: [
				"Scope pricing page refresh",
				"Not started",
				"Ari",
				"2026-02-18",
				"Medium",
			],
		},
		{
			id: 4,
			cells: [
				"Launch client feedback survey",
				"Blocked",
				"Maya",
				"2026-02-25",
				"High",
			],
		},
		{
			id: 5,
			cells: ["Update Q1 roadmap", "In review", "Noah", "2026-03-01", "Low"],
		},
	] as const;

	const sourceColumns = [
		{
			id: "Task Name",
			samples: ["Finalize onboarding flow", "Update Q1 roadmap"],
		},
		{ id: "Status", samples: ["In progress", "Blocked"] },
		{ id: "Owner", samples: ["Liam", "Maya"] },
		{ id: "Due Date", samples: ["2026-02-10", "2026-03-01"] },
		{ id: "Priority", samples: ["High", "Medium"] },
	] as const;

	const mappingFields = [
		{ id: "title", label: "Title", required: true, suggested: "Task Name" },
		{ id: "status", label: "Status", required: false, suggested: "Status" },
		{ id: "assignee", label: "Assignee", required: false, suggested: "Owner" },
		{
			id: "dueDate",
			label: "Due date",
			required: false,
			suggested: "Due Date",
		},
		{
			id: "priority",
			label: "Priority",
			required: false,
			suggested: "Priority",
		},
		{
			id: "description",
			label: "Description",
			required: false,
			suggested: "__skip",
		},
		{ id: "tags", label: "Tags", required: false, suggested: "__skip" },
	] as const;

	const [columnMapping, setColumnMapping] = useState<Record<string, string>>(
		mappingFields.reduce(
			(acc, field) => {
				acc[field.id] = field.suggested ?? "__skip";
				return acc;
			},
			{} as Record<string, string>,
		),
	);

	const requiredFields = mappingFields.filter((field) => field.required);
	const mappedRequiredCount = requiredFields.filter(
		(field) => columnMapping[field.id] !== "__skip",
	).length;
	const missingRequired = requiredFields.filter(
		(field) => columnMapping[field.id] === "__skip",
	);
	const totalRows = 2430;
	const errorRows = 17;
	const skippedRows = 6;
	const processedRows = Math.min(
		totalRows,
		Math.round((importProgress / 100) * totalRows),
	);
	const completedRows = totalRows - errorRows - skippedRows;
	const importStages = [
		{ id: "validate", label: "Validating headers", threshold: 10 },
		{ id: "map", label: "Mapping columns", threshold: 35 },
		{ id: "create", label: "Creating tasks", threshold: 75 },
		{ id: "finalize", label: "Finalizing import", threshold: 100 },
	] as const;
	const resetImportFlow = () => {
		setActiveStep(1);
		setHeaderRow(1);
		setUploadedFile(null);
		setImportStatus("idle");
		setImportProgress(0);
		setColumnMapping(
			mappingFields.reduce(
				(acc, field) => {
					acc[field.id] = field.suggested ?? "__skip";
					return acc;
				},
				{} as Record<string, string>,
			),
		);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};
	const formatBytes = (bytes: number) => {
		if (!bytes) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.min(
			sizes.length - 1,
			Math.floor(Math.log(bytes) / Math.log(k)),
		);
		const value = bytes / k ** i;
		return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
	};

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;
		const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
		setUploadedFile({
			name: file.name,
			size: formatBytes(file.size),
			type: extension,
		});
	};

	useEffect(() => {
		if (activeStep !== 4) {
			setImportStatus("idle");
			setImportProgress(0);
		}
	}, [activeStep]);

	useEffect(() => {
		if (activeStep === 4 && importStatus === "idle") {
			setImportProgress(0);
			setImportStatus("running");
		}
	}, [activeStep, importStatus]);

	useEffect(() => {
		if (activeStep !== 4 || importStatus !== "running") {
			return;
		}

		const interval = setInterval(() => {
			setImportProgress((prev) => {
				const increment = Math.floor(Math.random() * 8) + 6;
				const next = Math.min(100, prev + increment);
				if (next >= 100) {
					setImportStatus("done");
				}
				return next;
			});
		}, 450);

		return () => clearInterval(interval);
	}, [activeStep, importStatus]);

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Import</PaneTitle>
				<PaneDescription className="mt-1">
					Bring your existing data in just a few steps. Upload your file, map
					your properties, and import tasks seamlessly.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-6">
				<div className="flex flex-wrap items-center justify-center gap-3">
					{steps.map((step, index) => {
						const isActive = step.id === activeStep;
						const isComplete = step.id < activeStep;
						const isLast = index === steps.length - 1;
						const StepIcon = isComplete ? CheckCircle : Circle;
						return (
							<div
								key={step.id}
								className="flex items-center gap-3 text-sm text-muted-foreground"
							>
								<button
									type="button"
									onClick={() => setActiveStep(step.id)}
									className={cn(
										"flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1",
										isActive
											? "border-primary/50 bg-primary/10 text-primary"
											: isComplete
												? "border-primary/40 bg-primary/5 text-primary/80"
												: "border-border text-muted-foreground",
									)}
								>
									<StepIcon
										className="h-4 w-4"
										weight={isComplete ? "fill" : "regular"}
									/>
									<span className="text-xs font-semibold">{step.id}.</span>
									<span>{step.label}</span>
								</button>
								{!isLast && <span className="text-sm">›</span>}
							</div>
						);
					})}
				</div>

				{activeStep === 1 && (
					<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
						<div className="flex h-full flex-col gap-4">
							{!uploadedFile && (
								<label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-6 text-center transition hover:border-primary/50 hover:bg-primary/5">
									<input
										ref={fileInputRef}
										type="file"
										className="sr-only"
										onChange={handleFileChange}
									/>
									<UploadSimple className="h-6 w-6 text-primary" />
									<p className="text-sm font-medium text-foreground">
										Browse or drag your file here
									</p>
									<p className="text-[11px] text-muted-foreground">
										CSV or XLSX up to 10MB
									</p>
								</label>
							)}

							{uploadedFile && (
								<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
									<div className="flex min-w-0 items-center gap-3">
										<div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
											<FileText className="h-4 w-4" />
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-semibold text-foreground">
												{uploadedFile.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{uploadedFile.size} · Completed
											</p>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-muted-foreground hover:text-foreground"
										onClick={() => setUploadedFile(null)}
										aria-label="Remove file"
									>
										<TrashSimple className="h-4 w-4" />
									</Button>
								</div>
							)}
						</div>

						<div className="rounded-2xl border border-border/70 bg-card/70">
							<div className="grid grid-cols-[minmax(0,1fr)_100px] border-b border-border/60 px-4 py-3 text-xs font-semibold text-muted-foreground">
								<span>Expected column</span>
								<span className="text-right">Required</span>
							</div>
							<div className="divide-y divide-border/70">
								{columns.map((column) => (
									<div
										key={column.name}
										className="flex items-center justify-between px-4 py-3 text-sm"
									>
										<div className="flex items-center gap-2 text-foreground">
											<span>{column.name}</span>
											<Info className="h-4 w-4 text-muted-foreground" />
										</div>
										<div className="text-muted-foreground">
											{column.required ? (
												<CheckCircle
													className="h-4 w-4 text-primary"
													weight="fill"
												/>
											) : (
												"—"
											)}
										</div>
									</div>
								))}
							</div>
						</div>
					</div>
				)}

				{activeStep === 2 && (
					<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
						<div className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-5">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-foreground">
										Pick the header row
									</p>
									<p className="text-xs text-muted-foreground">
										Choose the row that contains your column names.
									</p>
								</div>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span>Header row</span>
									<Select
										value={String(headerRow)}
										onValueChange={(value) => setHeaderRow(Number(value))}
									>
										<SelectTrigger className="h-8 w-[120px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{previewRows.map((row) => (
												<SelectItem key={row.id} value={String(row.id)}>
													Row {row.id}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className="overflow-hidden rounded-xl border border-border/70">
								<div className="overflow-x-auto">
									<div className="min-w-[640px]">
										<div className="grid grid-cols-[60px_repeat(5,minmax(120px,1fr))] gap-0 border-b border-border/60 bg-muted/50 px-2 py-2 text-[11px] font-semibold text-muted-foreground">
											<span className="pl-2">Row</span>
											<span>Col A</span>
											<span>Col B</span>
											<span>Col C</span>
											<span>Col D</span>
											<span>Col E</span>
										</div>
										<div className="divide-y divide-border/70">
											{previewRows.map((row) => {
												const isSelected = headerRow === row.id;
												return (
													<button
														key={row.id}
														type="button"
														onClick={() => setHeaderRow(row.id)}
														className={cn(
															"grid w-full grid-cols-[60px_repeat(5,minmax(120px,1fr))] items-center px-2 py-3 text-left text-sm",
															isSelected
																? "bg-primary/10 text-foreground"
																: "bg-transparent text-muted-foreground hover:bg-muted/30",
														)}
													>
														<span className="flex items-center gap-2 pl-2 text-xs font-semibold">
															{isSelected ? (
																<CheckCircle
																	className="h-4 w-4 text-primary"
																	weight="fill"
																/>
															) : (
																<Circle className="h-4 w-4 text-muted-foreground" />
															)}
															{row.id}
														</span>
														{row.cells.map((cell, index) => (
															<span
																key={index}
																className={cn(isSelected && "text-foreground")}
															>
																{cell}
															</span>
														))}
													</button>
												);
											})}
										</div>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="rounded-2xl border border-border/70 bg-card/70 p-5">
								<p className="text-sm font-semibold text-foreground">
									File insights
								</p>
								<div className="mt-4 space-y-3 text-xs text-muted-foreground">
									<div className="flex items-center justify-between">
										<span>Detected columns</span>
										<span className="text-foreground">5 columns</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Rows scanned</span>
										<span className="text-foreground">2,430 rows</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Delimiter</span>
										<span className="text-foreground">Comma</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Encoding</span>
										<span className="text-foreground">UTF-8</span>
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
								<p className="text-sm font-semibold text-foreground">
									How we use this
								</p>
								<p className="mt-2 text-xs text-muted-foreground">
									We will use row {headerRow} as the field names, then start
									importing from the next row.
								</p>
								<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
									<CheckCircle className="h-4 w-4 text-primary" weight="fill" />
									First data row will be row {headerRow + 1}.
								</div>
							</div>
						</div>
					</div>
				)}

				{activeStep === 3 && (
					<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
						<div className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-5">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-foreground">
										Map your columns
									</p>
									<p className="text-xs text-muted-foreground">
										Match source columns to Dart fields. Required fields must be
										mapped.
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 text-xs"
									onClick={() =>
										setColumnMapping((prev) => {
											const next = { ...prev };
											mappingFields.forEach((field) => {
												next[field.id] = field.suggested ?? "__skip";
											});
											return next;
										})
									}
								>
									Auto-map
								</Button>
							</div>

							<div className="overflow-hidden rounded-xl border border-border/70">
								<div className="grid grid-cols-[minmax(0,1fr)_220px] border-b border-border/60 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground">
									<span>Expected field</span>
									<span>Map to column</span>
								</div>
								<div className="divide-y divide-border/70">
									{mappingFields.map((field) => (
										<div
											key={field.id}
											className="grid grid-cols-[minmax(0,1fr)_220px] items-center px-4 py-3"
										>
											<div className="flex items-center gap-2 text-sm">
												<span className="text-foreground">{field.label}</span>
												{field.required && (
													<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
														Required
													</span>
												)}
											</div>
											<Select
												value={columnMapping[field.id]}
												onValueChange={(value) =>
													setColumnMapping((prev) => ({
														...prev,
														[field.id]: value,
													}))
												}
											>
												<SelectTrigger className="h-9">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="__skip">Do not import</SelectItem>
													{sourceColumns.map((column) => (
														<SelectItem key={column.id} value={column.id}>
															{column.id}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									))}
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="rounded-2xl border border-border/70 bg-card/70 p-5">
								<p className="text-sm font-semibold text-foreground">
									Source columns
								</p>
								<div className="mt-4 space-y-3 text-xs text-muted-foreground">
									{sourceColumns.map((column) => (
										<div
											key={column.id}
											className="rounded-lg border border-border/60 bg-muted/20 p-3"
										>
											<div className="flex items-center justify-between text-sm text-foreground">
												<span>{column.id}</span>
												<span className="text-[10px] text-muted-foreground">
													Sample values
												</span>
											</div>
											<div className="mt-2 text-[11px] text-muted-foreground">
												{column.samples.join(" · ")}
											</div>
										</div>
									))}
								</div>
							</div>

							<div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
								<p className="text-sm font-semibold text-foreground">
									Mapping status
								</p>
								<div className="mt-3 text-xs text-muted-foreground">
									Required fields mapped: {mappedRequiredCount}/
									{requiredFields.length}
								</div>
								{missingRequired.length > 0 ? (
									<div className="mt-3 space-y-2 text-xs text-muted-foreground">
										{missingRequired.map((field) => (
											<div key={field.id} className="flex items-center gap-2">
												<Circle className="h-4 w-4 text-muted-foreground" />
												<span>{field.label} is not mapped</span>
											</div>
										))}
									</div>
								) : (
									<div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
										<CheckCircle
											className="h-4 w-4 text-primary"
											weight="fill"
										/>
										All required fields are mapped.
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				{activeStep === 4 && (
					<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
						<div className="space-y-5 rounded-2xl border border-border/70 bg-card/60 p-5">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-foreground">
										{importStatus === "done"
											? "Import complete"
											: "Importing tasks"}
									</p>
									<p className="text-xs text-muted-foreground">
										{importStatus === "done"
											? "Review the summary and open your imported tasks."
											: "We are validating and creating tasks from your file."}
									</p>
								</div>
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									{importStatus === "running" ? (
										<>
											<CircleNotch className="h-4 w-4 animate-spin text-primary" />
											Importing
										</>
									) : (
										<>
											<CheckCircle
												className="h-4 w-4 text-primary"
												weight="fill"
											/>
											Finished
										</>
									)}
								</div>
							</div>

							<div className="space-y-2">
								<Progress value={importProgress} />
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{importStatus === "done"
											? `Processed ${totalRows} rows`
											: `Processing ${processedRows} / ${totalRows} rows`}
									</span>
									<span className="text-foreground">{importProgress}%</span>
								</div>
							</div>

							<div className="rounded-xl border border-border/70 bg-muted/20 p-4">
								<p className="text-xs font-semibold text-muted-foreground">
									Import activity
								</p>
								<div className="mt-3 space-y-2 text-xs text-muted-foreground">
									{importStages.map((stage, index) => {
										const isComplete = importProgress >= stage.threshold;
										const isActive =
											importProgress < stage.threshold &&
											(index === 0 ||
												importProgress >= importStages[index - 1].threshold);
										return (
											<div key={stage.id} className="flex items-center gap-2">
												{isComplete ? (
													<CheckCircle
														className="h-4 w-4 text-primary"
														weight="fill"
													/>
												) : isActive ? (
													<CircleNotch className="h-4 w-4 animate-spin text-primary" />
												) : (
													<Circle className="h-4 w-4 text-muted-foreground" />
												)}
												<span className={cn(isComplete && "text-foreground")}>
													{stage.label}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						</div>

						<div className="space-y-4">
							<div className="rounded-2xl border border-border/70 bg-card/70 p-5">
								<p className="text-sm font-semibold text-foreground">
									Import summary
								</p>
								<div className="mt-4 space-y-3 text-xs text-muted-foreground">
									<div className="flex items-center justify-between">
										<span>Total rows</span>
										<span className="text-foreground">{totalRows}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Imported tasks</span>
										<span className="text-foreground">
											{importStatus === "done"
												? completedRows
												: Math.max(0, processedRows - 5)}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Skipped rows</span>
										<span className="text-foreground">{skippedRows}</span>
									</div>
									<div className="flex items-center justify-between">
										<span>Errors</span>
										<span className="text-foreground">{errorRows}</span>
									</div>
								</div>
							</div>

							<div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
								<p className="text-sm font-semibold text-foreground">
									Next actions
								</p>
								<p className="mt-2 text-xs text-muted-foreground">
									{importStatus === "done"
										? "Open the created tasks or download an error report."
										: "You can leave this open while the import completes."}
								</p>
								<div className="mt-4 flex flex-wrap gap-2">
									<Button type="button" size="sm" className="h-9 px-4">
										View tasks
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-9 px-4"
									>
										Download error report
									</Button>
								</div>
							</div>
						</div>
					</div>
				)}

				<div className="flex flex-wrap items-center justify-between gap-3">
					{activeStep < 4 && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-9 px-3"
							onClick={resetImportFlow}
						>
							Cancel import
						</Button>
					)}
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 px-4"
							onClick={() =>
								setActiveStep(
									(step) =>
										Math.max(1, step - 1) as (typeof steps)[number]["id"],
								)
							}
							disabled={activeStep === 1}
						>
							Back
						</Button>
						{activeStep < steps.length - 1 && (
							<Button
								type="button"
								size="sm"
								className="h-9 px-4"
								onClick={() =>
									setActiveStep(
										(step) =>
											Math.min(
												steps.length,
												step + 1,
											) as (typeof steps)[number]["id"],
									)
								}
							>
								Next
							</Button>
						)}
						{activeStep === steps.length - 1 && (
							<Button
								type="button"
								size="sm"
								className="h-9 px-4"
								onClick={() => {
									setActiveStep(4);
									setImportProgress(0);
									setImportStatus("running");
								}}
							>
								Start import
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

export function TypesSettingsPane() {
	const workspace = useWorkspaceOptional();
	const workspaceId = workspace?.workspaceId;
	const settings = useQuery(
		api.workspaceSettings.get,
		workspaceId ? { workspaceId } : "skip",
	);
	const labels = useQuery(
		api.labels.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const members = useQuery(
		api.workspaceMembers.list,
		workspaceId ? { workspaceId } : "skip",
	);
	const currentUser = useQuery(api.users.current);
	const updateTypes = useMutation(api.workspaceSettings.updateTypes);
	const updateStatuses = useMutation(api.workspaceSettings.updateStatuses);
	const updatePriorities = useMutation(api.workspaceSettings.updatePriorities);
	const createLabel = useMutation(api.labels.create);
	const updateLabel = useMutation(api.labels.update);
	const removeLabel = useMutation(api.labels.remove);

	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	const typeNav = [
		{ id: "types", label: "Issue types" },
		{ id: "statuses", label: "Statuses" },
		{ id: "priorities", label: "Priorities" },
		{ id: "labels", label: "Labels" },
	] as const;
	const [activeSection, setActiveSection] =
		useState<(typeof typeNav)[number]["id"]>("types");

	// Default hex colors for settings display (workspace settings store hex, not Tailwind classes)
	const defaultTypeItems = DEFAULT_ISSUE_TYPES.map((t) => ({
		key: t.key,
		name: t.name,
		color:
			t.key === "issue"
				? "#6b7280"
				: t.key === "bug"
					? "#ef4444"
					: t.key === "improvement"
						? "#f59e0b"
						: "#8b5cf6",
	}));
	const defaultStatusItems = DEFAULT_STATUSES.map((s) => ({
		key: s.key,
		name: s.name,
		color:
			s.key === "triage"
				? "#f97316"
				: s.key === "backlog"
					? "#6b7280"
					: s.key === "todo"
						? "#a3a3a3"
						: s.key === "in_progress"
							? "#3b82f6"
							: s.key === "in_review"
								? "#8b5cf6"
								: s.key === "done"
									? "#10b981"
									: "#ef4444",
	}));
	const defaultPriorityItems = DEFAULT_PRIORITIES.map((p) => ({
		key: p.key,
		name: p.name,
		color:
			p.key === "no_priority"
				? "#6b7280"
				: p.key === "low"
					? "#3b82f6"
					: p.key === "medium"
						? "#f59e0b"
						: p.key === "high"
							? "#f97316"
							: "#ef4444",
	}));

	const mergeDefaults = (
		defaults: { key: string; name: string; color: string }[],
		custom: { key: string; name: string; color: string }[] | undefined,
	) => {
		if (!custom || custom.length === 0) return defaults;
		return defaults.map((def) => {
			const override = custom.find((c) => c.key === def.key);
			return override ?? def;
		});
	};

	const types = mergeDefaults(defaultTypeItems, settings?.customTypes);
	const statuses = mergeDefaults(defaultStatusItems, settings?.customStatuses);
	const priorities = mergeDefaults(
		defaultPriorityItems,
		settings?.customPriorities,
	);

	// Editing state
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const editInputRef = useRef<HTMLInputElement>(null);

	// Label creation state
	const [isCreatingLabel, setIsCreatingLabel] = useState(false);
	const [newLabelName, setNewLabelName] = useState("");
	const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
	const [newLabelDescription, setNewLabelDescription] = useState("");
	const newLabelInputRef = useRef<HTMLInputElement>(null);

	// Label edit state
	const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
	const [editLabelName, setEditLabelName] = useState("");
	const editLabelInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingKey && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.select();
		}
	}, [editingKey]);

	useEffect(() => {
		if (isCreatingLabel && newLabelInputRef.current) {
			newLabelInputRef.current.focus();
		}
	}, [isCreatingLabel]);

	useEffect(() => {
		if (editingLabelId && editLabelInputRef.current) {
			editLabelInputRef.current.focus();
			editLabelInputRef.current.select();
		}
	}, [editingLabelId]);

	const handleSaveItem = async (
		section: "types" | "statuses" | "priorities",
		key: string,
		newName: string,
		newColor?: string,
	) => {
		if (!workspaceId) return;
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		const updated = items.map((item) =>
			item.key === key
				? { ...item, name: newName || item.name, color: newColor ?? item.color }
				: item,
		);
		try {
			if (section === "types") {
				await updateTypes({ workspaceId, customTypes: updated });
			} else if (section === "statuses") {
				await updateStatuses({ workspaceId, customStatuses: updated });
			} else {
				await updatePriorities({ workspaceId, customPriorities: updated });
			}
			toast.success("Updated successfully");
		} catch {
			toast.error("Failed to update");
		}
		setEditingKey(null);
	};

	const handleColorChange = async (
		section: "types" | "statuses" | "priorities",
		key: string,
		newColor: string,
	) => {
		if (!workspaceId) return;
		const items =
			section === "types"
				? types
				: section === "statuses"
					? statuses
					: priorities;
		const updated = items.map((item) =>
			item.key === key ? { ...item, color: newColor } : item,
		);
		try {
			if (section === "types") {
				await updateTypes({ workspaceId, customTypes: updated });
			} else if (section === "statuses") {
				await updateStatuses({ workspaceId, customStatuses: updated });
			} else {
				await updatePriorities({ workspaceId, customPriorities: updated });
			}
		} catch {
			toast.error("Failed to update color");
		}
	};

	const handleCreateLabel = async () => {
		if (!workspaceId || !newLabelName.trim()) return;
		try {
			await createLabel({
				workspaceId,
				name: newLabelName.trim(),
				color: newLabelColor,
				description: newLabelDescription.trim() || undefined,
			});
			toast.success("Label created");
			setNewLabelName("");
			setNewLabelColor("#3b82f6");
			setNewLabelDescription("");
			setIsCreatingLabel(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create label",
			);
		}
	};

	const handleUpdateLabel = async (
		labelId: Id<"labels">,
		updates: { name?: string; color?: string; description?: string },
	) => {
		try {
			await updateLabel({ labelId, ...updates });
			toast.success("Label updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update label",
			);
		}
		setEditingLabelId(null);
	};

	const handleRemoveLabel = async (labelId: Id<"labels">) => {
		try {
			await removeLabel({ labelId });
			toast.success("Label removed");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to remove label",
			);
		}
	};

	const getIcon = (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (section === "types") return getTypeConfig(key).icon;
		if (section === "statuses") return getStatusConfig(key).icon;
		return getPriorityConfig(key).icon;
	};

	const getIconColor = (
		section: "types" | "statuses" | "priorities",
		key: string,
	) => {
		if (section === "types") return getTypeConfig(key).color;
		if (section === "statuses") return getStatusConfig(key).color;
		return getPriorityConfig(key).color;
	};

	const renderItemList = (
		section: "types" | "statuses" | "priorities",
		items: { key: string; name: string; color: string }[],
	) => (
		<div className="space-y-2">
			{items.map((item) => {
				const Icon = getIcon(section, item.key);
				const iconColor = getIconColor(section, item.key);
				return (
					<div
						key={item.key}
						className="flex items-center gap-4 rounded-2xl bg-muted/20 px-4 py-3"
					>
						<Icon className={cn("h-4 w-4 shrink-0", iconColor)} />
						<ColorPicker
							color={item.color}
							onColorChange={(color) =>
								handleColorChange(section, item.key, color)
							}
							disabled={!isAdmin}
						/>
						<div className="flex flex-1 items-center gap-4 text-sm text-foreground">
							{editingKey === `${section}-${item.key}` ? (
								<Input
									ref={editInputRef}
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
									onBlur={() =>
										handleSaveItem(section, item.key, editName.trim())
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleSaveItem(section, item.key, editName.trim());
										}
										if (e.key === "Escape") {
											setEditingKey(null);
										}
									}}
									className="h-7 w-40 text-sm"
								/>
							) : (
								<span
									className={cn(
										"font-medium",
										isAdmin && "cursor-pointer hover:underline",
									)}
									onClick={() => {
										if (!isAdmin) return;
										setEditingKey(`${section}-${item.key}`);
										setEditName(item.name);
									}}
									onKeyDown={() => {}}
									role={isAdmin ? "button" : undefined}
									tabIndex={isAdmin ? 0 : undefined}
								>
									{item.name}
								</span>
							)}
							<span className="flex-1 text-left text-xs text-muted-foreground">
								{item.key}
							</span>
						</div>
					</div>
				);
			})}
		</div>
	);

	const renderLabelsSection = () => (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm font-semibold text-foreground">Labels</p>
				{isAdmin && (
					<button
						type="button"
						onClick={() => setIsCreatingLabel(true)}
						className="cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<Plus className="h-4 w-4" />
					</button>
				)}
			</div>

			{isCreatingLabel && (
				<div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
					<div className="flex items-center gap-3">
						<ColorPicker
							color={newLabelColor}
							onColorChange={setNewLabelColor}
						/>
						<Input
							ref={newLabelInputRef}
							value={newLabelName}
							onChange={(e) => setNewLabelName(e.target.value)}
							placeholder="Label name"
							className="h-8 flex-1 text-sm"
							onKeyDown={(e) => {
								if (e.key === "Enter") handleCreateLabel();
								if (e.key === "Escape") setIsCreatingLabel(false);
							}}
						/>
					</div>
					<Input
						value={newLabelDescription}
						onChange={(e) => setNewLabelDescription(e.target.value)}
						placeholder="Description (optional)"
						className="h-8 text-sm"
					/>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={handleCreateLabel}
							disabled={!newLabelName.trim()}
						>
							Create
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-3 text-xs"
							onClick={() => setIsCreatingLabel(false)}
						>
							Cancel
						</Button>
					</div>
				</div>
			)}

			<div className="space-y-2">
				{labels && labels.length > 0 ? (
					labels.map((label) => (
						<div
							key={label._id}
							className="flex items-center gap-4 rounded-2xl bg-muted/20 px-4 py-3"
						>
							<ColorPicker
								color={label.color}
								onColorChange={(color) =>
									handleUpdateLabel(label._id, { color })
								}
								disabled={!isAdmin}
							/>
							<div className="flex flex-1 items-center gap-4 text-sm text-foreground">
								{editingLabelId === label._id ? (
									<Input
										ref={editLabelInputRef}
										value={editLabelName}
										onChange={(e) => setEditLabelName(e.target.value)}
										onBlur={() =>
											handleUpdateLabel(label._id, {
												name: editLabelName.trim(),
											})
										}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleUpdateLabel(label._id, {
													name: editLabelName.trim(),
												});
											}
											if (e.key === "Escape") {
												setEditingLabelId(null);
											}
										}}
										className="h-7 w-40 text-sm"
									/>
								) : (
									<span
										className={cn(
											"font-medium",
											isAdmin && "cursor-pointer hover:underline",
										)}
										onClick={() => {
											if (!isAdmin) return;
											setEditingLabelId(label._id);
											setEditLabelName(label.name);
										}}
										onKeyDown={() => {}}
										role={isAdmin ? "button" : undefined}
										tabIndex={isAdmin ? 0 : undefined}
									>
										{label.name}
									</span>
								)}
								{label.description && (
									<span className="flex-1 text-left text-xs text-muted-foreground">
										{label.description}
									</span>
								)}
							</div>
							{isAdmin && (
								<button
									type="button"
									onClick={() => handleRemoveLabel(label._id)}
									className="cursor-pointer text-muted-foreground hover:text-destructive"
								>
									<TrashSimple className="h-4 w-4" />
								</button>
							)}
						</div>
					))
				) : (
					<p className="py-4 text-center text-sm text-muted-foreground">
						No labels yet. Create one to get started.
					</p>
				)}
			</div>
		</div>
	);

	if (!workspaceId) {
		return (
			<div className="flex h-full flex-col items-start justify-center gap-2">
				<PaneTitle className="text-xl">Types</PaneTitle>
				<PaneDescription>
					Select a workspace to configure types.
				</PaneDescription>
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-2xl border border-border">
			<div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
				<div className="border-b border-border/60 bg-card/70 lg:border-b-0 lg:border-r">
					<div className="px-4 py-3 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Customization
					</div>
					<div>
						{typeNav.map((item) => (
							<button
								key={item.id}
								type="button"
								onClick={() => setActiveSection(item.id)}
								className={cn(
									"flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-sm transition",
									activeSection === item.id
										? "bg-primary/10 text-primary"
										: "text-muted-foreground hover:bg-muted/40",
								)}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>

				<div className="space-y-6 bg-background/40 p-6">
					{activeSection === "types" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue types
							</p>
							<p className="text-xs text-muted-foreground">
								Customize the display names and colors for issue types. The
								internal key is fixed.
							</p>
							{renderItemList("types", types)}
						</div>
					)}

					{activeSection === "statuses" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue statuses
							</p>
							<p className="text-xs text-muted-foreground">
								Customize the display names and colors for issue statuses used
								in Kanban columns and badges.
							</p>
							{renderItemList("statuses", statuses)}
						</div>
					)}

					{activeSection === "priorities" && (
						<div className="space-y-4">
							<p className="text-sm font-semibold text-foreground">
								Issue priorities
							</p>
							<p className="text-xs text-muted-foreground">
								Customize the display names and colors for priority levels.
							</p>
							{renderItemList("priorities", priorities)}
						</div>
					)}

					{activeSection === "labels" && renderLabelsSection()}
				</div>
			</div>
		</div>
	);
}

export function NotificationsSettingsPane() {
	const user = useQuery(api.users.current);
	const updateUser = useMutation(api.users.update);

	const methodItems = [
		{
			id: "in-app" as const,
			title: "In-app",
			description: "Notifications will go into your Inbox",
			field: "notifyInApp" as const,
		},
		{
			id: "email" as const,
			title: "Email",
			description: "You will receive emails about events",
			field: "notifyEmail" as const,
		},
	];

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Notifications</PaneTitle>
				<PaneDescription className="mt-1">
					Stay in the loop without the noise. Choose where you get updates, and
					customize which activities trigger notifications.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-4">
				<h3 className="text-sm font-semibold text-foreground">Methods</h3>
				<div className="space-y-3">
					{methodItems.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between rounded-xl border border-border bg-card/80 px-4 py-3"
						>
							<div className="flex flex-col">
								<span className="text-sm text-foreground">{item.title}</span>
								<span className="text-xs text-muted-foreground">
									{item.description}
								</span>
							</div>
							<Switch
								checked={user?.[item.field] ?? true}
								onCheckedChange={async (checked) => {
									try {
										await updateUser({ [item.field]: checked });
										toast.success(
											`${item.title} notifications ${checked ? "enabled" : "disabled"}`,
										);
									} catch {
										toast.error(
											`Failed to update ${item.title.toLowerCase()} notifications`,
										);
									}
								}}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function AgentsSettingsPane() {
	const capabilityHighlights = [
		{
			id: "planning",
			label: "Plan work and break it into tasks with clear owners.",
			icon: CheckCircle,
		},
		{
			id: "review",
			label: "Review specs and docs for gaps before execution.",
			icon: ShieldCheck,
		},
		{
			id: "updates",
			label: "Draft status updates and summaries for the team.",
			icon: PencilSimpleLine,
		},
		{
			id: "automation",
			label: "Run checks and workflows with approval guardrails.",
			icon: Sparkle,
		},
	] as const;

	const moreAgents = [
		{
			id: "create",
			title: "Create a custom agent",
			description:
				"Design a specialist with your tools, rules, and API connections.",
			icon: Plus,
			variant: "create",
		},
		{
			id: "spec-writer",
			title: "Product spec writer",
			description:
				"Turns ideas into structured specs, milestones, and acceptance criteria.",
			icon: PencilSimpleLine,
			variant: "default",
		},
		{
			id: "qa-tester",
			title: "QA tester",
			description:
				"Finds regressions, drafts test plans, and highlights risks.",
			icon: CheckCircle,
			variant: "default",
		},
		{
			id: "ui-reviewer",
			title: "UI reviewer",
			description: "Audits UI for consistency, accessibility, and polish.",
			icon: Sparkle,
			variant: "default",
		},
		{
			id: "release",
			title: "Release manager",
			description:
				"Builds release notes, launch checklists, and stakeholder updates.",
			icon: ShieldCheck,
			variant: "default",
		},
		{
			id: "support",
			title: "Customer support drafts",
			description: "Writes empathetic replies with product-aware context.",
			icon: UsersThree,
			variant: "default",
		},
	] as const;

	const quickActions = [
		{
			id: "manage",
			label: "Manage agents",
			icon: SlidersHorizontal,
			variant: "outline" as const,
		},
		{
			id: "invite",
			label: "Invite teammate",
			icon: UsersThree,
			variant: "outline" as const,
		},
		{
			id: "connect",
			label: "Connect tools",
			icon: UploadSimple,
			variant: "default" as const,
		},
	] as const;

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Agents</PaneTitle>
				<PaneDescription className="mt-1">
					Create specialized AI teammates to plan, write, review, and ship work
					alongside you. Each agent has its own tools, rules, and permissions.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-sm font-semibold text-foreground">Your team</h3>
					<Button variant="outline" size="sm" className="h-8 px-3 text-xs">
						Manage agents
					</Button>
				</div>
				<div className="rounded-2xl border border-border bg-card/70 p-4">
					<div className="flex flex-wrap items-start justify-between gap-4">
						<div className="flex items-start gap-4">
							<div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
								<Robot className="h-5 w-5" />
							</div>
							<div className="space-y-2">
								<div className="flex flex-wrap items-center gap-2">
									<span className="text-sm font-semibold text-foreground">
										Dart AI
									</span>
									<span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
										<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
										Active
									</span>
								</div>
								<p className="text-xs text-muted-foreground">
									Plan, manage, and build any task or project with the full
									context of your workspace.
								</p>
							</div>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="sm" className="h-8 px-3 text-xs">
								View activity
							</Button>
							<Button size="sm" className="h-8 px-3 text-xs">
								Open agent
							</Button>
						</div>
					</div>

					<div className="mt-4 grid gap-3 sm:grid-cols-2">
						{capabilityHighlights.map((capability) => {
							const Icon = capability.icon;
							return (
								<div
									key={capability.id}
									className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground"
								>
									<span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
										<Icon className="h-3.5 w-3.5" />
									</span>
									<span>{capability.label}</span>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold text-foreground">More agents</h3>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-xs text-muted-foreground"
					>
						Browse all templates
					</Button>
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
					{moreAgents.map((agent) => {
						const Icon = agent.icon;
						const isCreate = agent.variant === "create";
						return (
							<button
								key={agent.id}
								type="button"
								className={cn(
									"flex h-full cursor-pointer flex-col gap-3 rounded-2xl border px-4 py-4 text-left transition",
									isCreate
										? "border-dashed border-primary/50 bg-primary/5 text-foreground hover:border-primary/70"
										: "border-border bg-card/70 text-foreground hover:border-primary/40 hover:bg-primary/5",
								)}
							>
								<span
									className={cn(
										"flex h-9 w-9 items-center justify-center rounded-xl",
										isCreate
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									<Icon className="h-4 w-4" />
								</span>
								<div className="space-y-1">
									<p className="text-sm font-semibold">{agent.title}</p>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{agent.description}
									</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-foreground">Quick actions</h3>
				<div className="flex flex-wrap gap-3">
					{quickActions.map((action) => {
						const Icon = action.icon;
						return (
							<Button
								key={action.id}
								variant={action.variant}
								size="sm"
								className="gap-2"
							>
								<Icon className="h-4 w-4" />
								{action.label}
							</Button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export function SkillsSettingsPane() {
	const installedSkills = [
		{
			id: "figma",
			name: "Figma to code",
			description: "Translate design frames into UI-ready components.",
			category: "Design",
			lastUsed: "2 days ago",
			enabled: true,
			icon: Sparkle,
		},
		{
			id: "ci",
			name: "CI failure triage",
			description: "Summarize failed checks and propose next fixes.",
			category: "DevOps",
			lastUsed: "Yesterday",
			enabled: true,
			icon: ShieldCheck,
		},
		{
			id: "meeting",
			name: "Meeting to action items",
			description: "Extract decisions and next steps from transcripts.",
			category: "Docs",
			lastUsed: "4 days ago",
			enabled: false,
			icon: PencilSimpleLine,
		},
	] as const;

	const skillLibrary = [
		{
			id: "release-notes",
			title: "Release notes generator",
			description: "Turns merged work into polished release notes.",
			icon: Star,
		},
		{
			id: "support",
			title: "Support reply drafts",
			description: "Creates empathetic responses with product context.",
			icon: UsersThree,
		},
		{
			id: "research",
			title: "User research summaries",
			description: "Condenses interviews into insights and themes.",
			icon: Sparkle,
		},
		{
			id: "roadmap",
			title: "Roadmap planner",
			description: "Builds milestones and timelines from strategy notes.",
			icon: SlidersHorizontal,
		},
	] as const;

	const insights = [
		{ id: "top-skill", label: "Top skill", value: "Figma to code" },
		{ id: "weekly-runs", label: "Runs this week", value: "28" },
		{ id: "time-saved", label: "Estimated time saved", value: "6.4 hrs" },
	] as const;

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Skills</PaneTitle>
				<PaneDescription className="mt-1">
					Skills are reusable workflows and toolchains. Add them to agents or
					use them directly to speed up repeat tasks.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h3 className="text-sm font-semibold text-foreground">
						Installed skills
					</h3>
					<Button variant="outline" size="sm" className="h-8 px-3 text-xs">
						Manage library
					</Button>
				</div>
				<div className="space-y-3">
					{installedSkills.map((skill) => {
						const Icon = skill.icon;
						return (
							<div
								key={skill.id}
								className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="space-y-3">
									<div className="flex items-start gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
											<Icon className="h-4 w-4" />
										</div>
										<div className="space-y-1">
											<p className="text-sm font-semibold text-foreground">
												{skill.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{skill.description}
											</p>
										</div>
									</div>
									<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
										<span className="rounded-full border border-border/70 px-2 py-0.5">
											{skill.category}
										</span>
										<span className="rounded-full border border-border/70 px-2 py-0.5">
											Last used {skill.lastUsed}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-2">
									<span
										className={cn(
											"text-xs font-semibold",
											skill.enabled
												? "text-emerald-400"
												: "text-muted-foreground",
										)}
									>
										{skill.enabled ? "Active" : "Paused"}
									</span>
									<Switch defaultChecked={skill.enabled} />
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold text-foreground">
						Skill library
					</h3>
					<Button
						variant="ghost"
						size="sm"
						className="h-8 px-2 text-xs text-muted-foreground"
					>
						Browse all
					</Button>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					{skillLibrary.map((skill) => {
						const Icon = skill.icon;
						return (
							<button
								key={skill.id}
								type="button"
								className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-card/70 px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
							>
								<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
									<Icon className="h-4 w-4" />
								</span>
								<div className="space-y-1">
									<p className="text-sm font-semibold">{skill.title}</p>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{skill.description}
									</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-foreground">Add a skill</h3>
				<div className="flex flex-wrap gap-3">
					<Button variant="outline" size="sm" className="gap-2">
						<Plus className="h-4 w-4" />
						Install from library
					</Button>
					<Button variant="outline" size="sm" className="gap-2">
						<UploadSimple className="h-4 w-4" />
						Import from repo
					</Button>
					<Button size="sm" className="gap-2">
						<Sparkle className="h-4 w-4" />
						Create new skill
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					Usage insights
				</h3>
				<div className="grid gap-3 md:grid-cols-3">
					{insights.map((insight) => (
						<div
							key={insight.id}
							className="rounded-2xl border border-border bg-muted/30 px-4 py-3"
						>
							<div className="text-xs text-muted-foreground">
								{insight.label}
							</div>
							<div className="mt-1 text-sm font-semibold text-foreground">
								{insight.value}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

export function PlaceholderSettingsPane() {
	return (
		<div className="flex h-full flex-col items-start justify-center gap-2">
			<PaneTitle className="text-xl">Settings preview</PaneTitle>
			<PaneDescription>
				This area is reserved for additional settings pages in the full product.
			</PaneDescription>
		</div>
	);
}

function SettingSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-4">
			<div className="text-sm font-semibold text-foreground">{title}</div>
			<div className="space-y-5">{children}</div>
		</section>
	);
}

function SettingRow({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-10 sm:grid sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)] sm:items-center sm:gap-6">
			<div className="space-y-1">
				<div className="text-sm font-medium text-foreground">{label}</div>
				{description && (
					<p className="text-xs text-muted-foreground leading-relaxed">
						{description}
					</p>
				)}
			</div>
			<div className="flex flex-col gap-2 text-sm text-foreground">
				{children}
			</div>
		</div>
	);
}
