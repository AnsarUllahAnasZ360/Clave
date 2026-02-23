"use client";

import {
	CircleNotch,
	CopySimple,
	CreditCard,
	Gear,
	Plus,
	ShieldCheck,
	TrashSimple,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { BillingSettingsPage } from "@/components/billing/BillingSettingsPage";
import { useOrganization } from "@/components/providers/organization-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
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
import type { Id } from "../../../convex/_generated/dataModel";

// --- Shared layout helpers ---

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

// --- Section definitions ---

export type OrgSettingsSectionId =
	| "general"
	| "members"
	| "invite-codes"
	| "billing";

const orgSettingsSections: {
	id: OrgSettingsSectionId;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	adminOnly: boolean;
}[] = [
	{ id: "general", label: "General", icon: Gear, adminOnly: false },
	{ id: "members", label: "Members", icon: UsersThree, adminOnly: true },
	{
		id: "invite-codes",
		label: "Invite Codes",
		icon: ShieldCheck,
		adminOnly: true,
	},
	{ id: "billing", label: "Billing", icon: CreditCard, adminOnly: true },
];

function getVisibleOrgSettingsSections(isAdmin: boolean) {
	return isAdmin
		? orgSettingsSections
		: orgSettingsSections.filter((section) => !section.adminOnly);
}

type OrgMemberItem = {
	_id: Id<"organizationMembers">;
	userId: Id<"users">;
	role: "owner" | "admin" | "member";
	user: {
		_id: Id<"users">;
		name?: string;
		email?: string;
		image?: string;
		avatarUrl?: string;
		role?: string;
	} | null;
};

type OrgInviteCodeItem = {
	_id: Id<"organizationInviteCodes">;
	code: string;
	role: "admin" | "member";
	useCount: number;
	maxUses?: number;
	expiresAt?: number;
};

// --- General Pane ---

function GeneralPane({ isAdmin }: { isAdmin: boolean }) {
	const org = useOrganization();
	const orgData = useQuery(api.organizations.getById, {
		organizationId: org.organizationId,
	});
	const logoUrl = useQuery(api.organizations.getLogoUrl, {
		organizationId: org.organizationId,
	});
	const updateOrg = useMutation(api.organizations.update);
	const generateLogoUploadUrl = useMutation(
		api.organizations.generateLogoUploadUrl,
	);

	const logoInputRef = useRef<HTMLInputElement | null>(null);
	const [logoObjectUrl, setLogoObjectUrl] = useState<string | null>(null);
	const [isUploadingLogo, setIsUploadingLogo] = useState(false);
	const [logoCropSrc, setLogoCropSrc] = useState<string | null>(null);
	const [logoCropOpen, setLogoCropOpen] = useState(false);

	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [descValue, setDescValue] = useState("");

	useEffect(() => {
		if (orgData) {
			setNameValue(orgData.name);
			setSlugValue(orgData.slug);
			setDescValue(orgData.description ?? "");
		}
	}, [orgData]);

	useEffect(() => {
		return () => {
			if (logoObjectUrl) {
				URL.revokeObjectURL(logoObjectUrl);
			}
		};
	}, [logoObjectUrl]);

	const logoPreview = logoObjectUrl ?? logoUrl ?? "";

	const handleNameBlur = useCallback(async () => {
		if (!orgData || nameValue === orgData.name) return;
		if (nameValue.trim().length < 2) {
			toast.error("Organization name must be at least 2 characters");
			setNameValue(orgData.name);
			return;
		}
		try {
			await updateOrg({
				organizationId: org.organizationId,
				name: nameValue.trim(),
			});
			toast.success("Organization name updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update name",
			);
			setNameValue(orgData.name);
		}
	}, [orgData, nameValue, updateOrg, org.organizationId]);

	const handleSlugBlur = useCallback(async () => {
		if (!orgData || slugValue === orgData.slug) return;
		const normalized = slugValue
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		if (normalized.length < 2) {
			toast.error("Slug must be at least 2 characters");
			setSlugValue(orgData.slug);
			return;
		}
		try {
			await updateOrg({
				organizationId: org.organizationId,
				slug: normalized,
			});
			setSlugValue(normalized);
			toast.success("Organization slug updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update slug",
			);
			setSlugValue(orgData.slug);
		}
	}, [orgData, slugValue, updateOrg, org.organizationId]);

	const handleDescBlur = useCallback(async () => {
		if (!orgData || descValue === (orgData.description ?? "")) return;
		try {
			await updateOrg({
				organizationId: org.organizationId,
				description: descValue.trim(),
			});
			toast.success("Description updated");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update description",
			);
		}
	}, [orgData, descValue, updateOrg, org.organizationId]);

	const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

		const src = URL.createObjectURL(file);
		setLogoCropSrc((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return src;
		});
		setLogoCropOpen(true);
		event.target.value = "";
	};

	const handleLogoCropComplete = async (blob: Blob) => {
		const nextUrl = URL.createObjectURL(blob);
		setLogoObjectUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return nextUrl;
		});

		setIsUploadingLogo(true);
		try {
			const uploadUrl = await generateLogoUploadUrl({
				organizationId: org.organizationId,
			});
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": blob.type },
				body: blob,
			});
			const { storageId } = await response.json();
			await updateOrg({
				organizationId: org.organizationId,
				logoStorageId: storageId,
			});
			toast.success("Logo updated");
		} catch {
			toast.error("Failed to upload logo");
		} finally {
			setIsUploadingLogo(false);
		}
	};

	if (!orgData) {
		return (
			<div className="space-y-8">
				<div>
					<PaneTitle className="text-xl">General</PaneTitle>
					<PaneDescription className="mt-1">Loading...</PaneDescription>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">General</PaneTitle>
				<PaneDescription className="mt-1">
					Manage your organization identity and branding.
				</PaneDescription>
			</div>

			<Separator />

			<SettingSection title="Organization logo">
				<div className="flex flex-wrap items-center gap-4">
					<Avatar className="h-16 w-16 rounded-xl border border-border bg-muted">
						<AvatarImage
							src={logoPreview}
							alt="Organization"
							className="rounded-xl object-cover"
						/>
						<AvatarFallback className="rounded-xl bg-muted">
							<span className="text-2xl font-bold text-muted-foreground">
								{nameValue?.[0]?.toUpperCase() ?? "O"}
							</span>
						</AvatarFallback>
					</Avatar>
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
							aria-label="Upload organization logo"
						/>
						<ImageCropDialog
							open={logoCropOpen}
							onOpenChange={setLogoCropOpen}
							imageSrc={logoCropSrc}
							cropShape="rect"
							title="Crop organization logo"
							onCropComplete={handleLogoCropComplete}
						/>
						<span className="text-xs text-muted-foreground">
							Max 2MB, image files only
						</span>
					</div>
				</div>
			</SettingSection>

			<SettingSection title="Organization details">
				<SettingRow
					label="Name"
					description="The display name for your organization."
				>
					<Input
						value={nameValue}
						onChange={(e) => setNameValue(e.target.value)}
						onBlur={handleNameBlur}
						className="max-w-xs"
						disabled={!isAdmin}
					/>
				</SettingRow>

				<SettingRow label="URL slug" description="Used in organization URLs.">
					<Input
						value={slugValue}
						onChange={(e) =>
							setSlugValue(
								e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
							)
						}
						onBlur={handleSlugBlur}
						className="max-w-xs"
						disabled={!isAdmin}
					/>
				</SettingRow>

				<SettingRow
					label="Description"
					description="A short description for your organization."
				>
					<textarea
						value={descValue}
						onChange={(e) => setDescValue(e.target.value)}
						onBlur={handleDescBlur}
						className="min-h-[80px] w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						disabled={!isAdmin}
						placeholder="What does your organization do?"
					/>
				</SettingRow>
			</SettingSection>
		</div>
	);
}

// --- Members Pane ---

function MembersPane() {
	const org = useOrganization();
	const members = useQuery(api.organizationMembers.list, {
		organizationId: org.organizationId,
	});
	const currentUser = useQuery(api.users.current);
	const removeMember = useMutation(api.organizationMembers.remove);
	const updateRole = useMutation(api.organizationMembers.updateRole);

	const [removingUserId, setRemovingUserId] = useState<string | null>(null);
	const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(
		null,
	);

	// Sort: owners first, then admins, then members, then alphabetically
	const sortedMembers = [...((members ?? []) as OrgMemberItem[])].sort(
		(a, b) => {
			const roleOrder: Record<OrgMemberItem["role"], number> = {
				owner: 0,
				admin: 1,
				member: 2,
			};
			const aOrder = roleOrder[a.role] ?? 2;
			const bOrder = roleOrder[b.role] ?? 2;
			if (aOrder !== bOrder) return aOrder - bOrder;
			const nameA = a.user?.name ?? "";
			const nameB = b.user?.name ?? "";
			return nameA.localeCompare(nameB);
		},
	);

	const handleRemoveMember = useCallback(
		async (userId: string) => {
			try {
				await removeMember({
					organizationId: org.organizationId,
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
		[org.organizationId, removeMember],
	);

	const handleChangeRole = useCallback(
		async (userId: string, newRole: "admin" | "member") => {
			try {
				await updateRole({
					organizationId: org.organizationId,
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
		[org.organizationId, updateRole],
	);

	const roleBadgeClass = (role: string) => {
		switch (role) {
			case "owner":
				return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
			case "admin":
				return "bg-primary/10 text-primary";
			default:
				return "bg-muted text-muted-foreground";
		}
	};

	const roleLabel = (role: string) => {
		switch (role) {
			case "owner":
				return "Owner";
			case "admin":
				return "Admin";
			default:
				return "Member";
		}
	};

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Members</PaneTitle>
				<PaneDescription className="mt-1">
					View and manage organization members and their roles.
				</PaneDescription>
			</div>

			<Separator />

			<div className="rounded-2xl border border-border">
				<div className="grid grid-cols-12 px-4 py-3 text-xs font-medium text-muted-foreground">
					<span className="col-span-5">Name</span>
					<span className="col-span-3">Email</span>
					<span className="col-span-2 text-right sm:text-left">Role</span>
					<span className="col-span-2 text-right">Actions</span>
				</div>
				<div className="divide-y divide-border">
					{!members && (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							Loading...
						</div>
					)}
					{sortedMembers.map((mate: OrgMemberItem) => {
						const initials = mate.user?.name
							? mate.user.name
									.split(" ")
									.map((n: string) => n[0])
									.join("")
									.toUpperCase()
									.slice(0, 2)
							: "?";
						const isSelf = mate.userId === currentUser?._id;
						const isOwner = mate.role === "owner";

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
									<div className="flex flex-col min-w-0">
										<span className="text-sm font-medium text-foreground truncate">
											{mate.user?.name ?? "Unknown"}
											{isSelf && (
												<span className="ml-1 text-xs text-muted-foreground">
													(you)
												</span>
											)}
										</span>
									</div>
								</div>
								<div className="col-span-3 text-sm text-muted-foreground truncate">
									{mate.user?.email ?? ""}
								</div>
								<div className="col-span-2 text-right sm:text-left">
									{!isSelf && !isOwner && changingRoleUserId === mate._id ? (
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
												roleBadgeClass(mate.role),
												!isSelf &&
													!isOwner &&
													"cursor-pointer hover:opacity-80",
											)}
											onClick={() => {
												if (!isSelf && !isOwner) {
													setChangingRoleUserId(mate._id);
												}
											}}
											disabled={isSelf || isOwner}
										>
											{roleLabel(mate.role)}
										</button>
									)}
								</div>
								<div className="col-span-2 text-right">
									{!isSelf &&
										!isOwner &&
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
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

// --- Invite Codes Pane ---

function InviteCodesPane() {
	const org = useOrganization();
	const codes = useQuery(api.organizationInviteCodes.listByOrg, {
		organizationId: org.organizationId,
	});
	const generateCode = useMutation(api.organizationInviteCodes.generate);
	const revokeCode = useMutation(api.organizationInviteCodes.revoke);

	const [isGenerating, setIsGenerating] = useState(false);
	const [newCodeRole, setNewCodeRole] = useState<"member" | "admin">("member");
	const [revokingId, setRevokingId] = useState<string | null>(null);

	const handleGenerate = useCallback(async () => {
		setIsGenerating(true);
		try {
			const code = await generateCode({
				organizationId: org.organizationId,
				role: newCodeRole,
				expiresInHours: 7 * 24, // 7 days
			});
			toast.success(`Invite code generated: ${code}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to generate code",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [org.organizationId, generateCode, newCodeRole]);

	const handleCopyCode = useCallback(async (code: string) => {
		try {
			await navigator.clipboard.writeText(code);
			toast.success("Invite code copied to clipboard");
		} catch {
			toast.error("Failed to copy invite code");
		}
	}, []);

	const handleRevoke = useCallback(
		async (codeId: string) => {
			try {
				await revokeCode({
					organizationId: org.organizationId,
					codeId: codeId as Parameters<typeof revokeCode>[0]["codeId"],
				});
				toast.success("Invite code revoked");
				setRevokingId(null);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to revoke code",
				);
			}
		},
		[org.organizationId, revokeCode],
	);

	const formatExpiry = (expiresAt?: number) => {
		if (!expiresAt) return "Never";
		const now = Date.now();
		if (expiresAt < now) return "Expired";
		const hoursLeft = Math.round((expiresAt - now) / (1000 * 60 * 60));
		if (hoursLeft < 24) return `${hoursLeft}h left`;
		const daysLeft = Math.round(hoursLeft / 24);
		return `${daysLeft}d left`;
	};

	return (
		<div className="space-y-8">
			<div>
				<PaneTitle className="text-xl">Invite Codes</PaneTitle>
				<PaneDescription className="mt-1">
					Generate and manage invite codes for your organization.
				</PaneDescription>
			</div>

			<Separator />

			<div className="space-y-3">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={newCodeRole}
						onValueChange={(val) => setNewCodeRole(val as "member" | "admin")}
					>
						<SelectTrigger className="h-9 w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="member">Member</SelectItem>
							<SelectItem value="admin">Admin</SelectItem>
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="lg"
						className="sm:w-auto rounded-lg"
						onClick={handleGenerate}
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
			</div>

			<div className="rounded-2xl border border-border">
				<div className="grid grid-cols-12 px-4 py-3 text-xs font-medium text-muted-foreground">
					<span className="col-span-3">Code</span>
					<span className="col-span-2">Role</span>
					<span className="col-span-2">Uses</span>
					<span className="col-span-2">Expires</span>
					<span className="col-span-3 text-right">Actions</span>
				</div>
				<div className="divide-y divide-border">
					{!codes && (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							Loading...
						</div>
					)}
					{codes?.length === 0 && (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							No invite codes yet. Generate one above.
						</div>
					)}
					{codes?.map((code: OrgInviteCodeItem) => {
						const isExpired =
							code.expiresAt !== undefined && code.expiresAt < Date.now();
						const isMaxedOut =
							code.maxUses !== undefined && code.useCount >= code.maxUses;

						return (
							<div
								key={code._id}
								className={cn(
									"grid grid-cols-12 items-center px-4 py-3",
									(isExpired || isMaxedOut) && "opacity-50",
								)}
							>
								<div className="col-span-3">
									<code className="text-sm font-mono tracking-wider">
										{code.code}
									</code>
								</div>
								<div className="col-span-2">
									<span
										className={cn(
											"inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
											code.role === "admin"
												? "bg-primary/10 text-primary"
												: "bg-muted text-muted-foreground",
										)}
									>
										{code.role === "admin" ? "Admin" : "Member"}
									</span>
								</div>
								<div className="col-span-2 text-sm text-muted-foreground">
									{code.useCount}
									{code.maxUses !== undefined ? `/${code.maxUses}` : ""}
								</div>
								<div className="col-span-2 text-sm text-muted-foreground">
									{formatExpiry(code.expiresAt)}
								</div>
								<div className="col-span-3 flex items-center justify-end gap-1">
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2"
										onClick={() => handleCopyCode(code.code)}
									>
										<CopySimple className="h-4 w-4" />
									</Button>
									{revokingId === code._id ? (
										<div className="flex items-center gap-1">
											<Button
												variant="destructive"
												size="sm"
												className="h-6 px-2 text-xs"
												onClick={() => handleRevoke(code._id)}
											>
												Confirm
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-6 px-2 text-xs"
												onClick={() => setRevokingId(null)}
											>
												Cancel
											</Button>
										</div>
									) : (
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-muted-foreground hover:text-destructive"
											onClick={() => setRevokingId(code._id)}
										>
											<TrashSimple className="h-4 w-4" />
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function BillingPane({ isAdmin }: { isAdmin: boolean }) {
	return <BillingSettingsPage isAdmin={isAdmin} />;
}

type OrgSettingsPanelProps = {
	activeSection: OrgSettingsSectionId;
	onSectionChange: (section: OrgSettingsSectionId) => void;
	isAdmin: boolean;
	className?: string;
	billingMode?: "inline" | "redirect";
	onBillingSelect?: () => void;
};

export function OrgSettingsPanel({
	activeSection,
	onSectionChange,
	isAdmin,
	className,
	billingMode = "inline",
	onBillingSelect,
}: OrgSettingsPanelProps) {
	const visibleSections = getVisibleOrgSettingsSections(isAdmin);
	const resolvedActiveSection = visibleSections.some(
		(section) => section.id === activeSection,
	)
		? activeSection
		: "general";

	return (
		<div className={cn("flex h-full", className)}>
			<aside className="w-52 shrink-0 overflow-y-auto border-r border-border/60 bg-muted/40 px-3 py-4">
				<div className="space-y-1 text-sm">
					{visibleSections.map((section) => {
						const isActive =
							section.id === resolvedActiveSection &&
							(billingMode === "inline" || section.id !== "billing");
						const Icon = section.icon;
						return (
							<button
								key={section.id}
								type="button"
								onClick={() => {
									if (section.id === "billing" && billingMode === "redirect") {
										onBillingSelect?.();
										return;
									}
									onSectionChange(section.id);
								}}
								className={cn(
									"flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[15px] text-muted-foreground hover:bg-accent hover:text-foreground",
									isActive && "bg-accent text-foreground",
								)}
							>
								<Icon className="h-4 w-4" />
								{section.label}
							</button>
						);
					})}
				</div>
			</aside>

			<main className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
				{resolvedActiveSection === "general" && (
					<GeneralPane isAdmin={isAdmin} />
				)}
				{resolvedActiveSection === "members" && <MembersPane />}
				{resolvedActiveSection === "invite-codes" && <InviteCodesPane />}
				{resolvedActiveSection === "billing" && billingMode === "inline" && (
					<BillingPane isAdmin={isAdmin} />
				)}
			</main>
		</div>
	);
}

// --- Main Dialog ---

export function OrgSettingsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const org = useOrganization();
	const router = useRouter();
	const myRole = useQuery(api.organizationMembers.myRole, {
		organizationId: org.organizationId,
	});

	const isAdmin = myRole?.role === "admin" || myRole?.role === "owner";
	const visibleSections = getVisibleOrgSettingsSections(isAdmin);
	const [activeSection, setActiveSection] =
		useState<OrgSettingsSectionId>("general");

	useEffect(() => {
		if (open) {
			setActiveSection("general");
		}
	}, [open]);

	useEffect(() => {
		if (!visibleSections.some((section) => section.id === activeSection)) {
			setActiveSection("general");
		}
	}, [visibleSections, activeSection]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="h-[600px] max-w-4xl gap-0 overflow-hidden p-0">
				<DialogTitle className="sr-only">Organization Settings</DialogTitle>
				<OrgSettingsPanel
					activeSection={activeSection}
					onSectionChange={setActiveSection}
					isAdmin={isAdmin}
					billingMode="redirect"
					onBillingSelect={() => {
						onOpenChange(false);
						router.push(
							`/organizations/${org.orgSlug}/settings?section=billing`,
						);
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
