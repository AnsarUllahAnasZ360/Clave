"use client";

import {
	Circle,
	CircleNotch,
	CopySimple,
	Globe,
	Lock,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import {
	useCurrentUser,
	useWorkspaceMembers,
} from "@/components/providers/workspace-data-context";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import {
	PaneDescription,
	PaneTitle,
	SettingRow,
	SettingSection,
} from "./settings-shared";
export function IdentitySettingsPane() {
	const workspace = useWorkspaceOptional();
	const currentUser = useCurrentUser();
	const members = useWorkspaceMembers();
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
	const [logoCropSrc, setLogoCropSrc] = useState<string | null>(null);
	const [logoCropOpen, setLogoCropOpen] = useState(false);

	const [nameValue, setNameValue] = useState("");
	const [slugValue, setSlugValue] = useState("");
	const [descValue, setDescValue] = useState("");
	const [visibilityValue, setVisibilityValue] = useState<"public" | "private">(
		"public",
	);
	const [copied, setCopied] = useState(false);

	const currentMember = members?.find((m) => m.userId === currentUser?._id);
	const isAdmin = currentMember?.role === "admin";

	// Sync form state from workspace data
	useEffect(() => {
		if (workspaceData) {
			setNameValue(workspaceData.name);
			setSlugValue(workspaceData.slug);
			setDescValue(workspaceData.description ?? "");
			setVisibilityValue(workspaceData.visibility ?? "public");
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

	const handleVisibilityChange = useCallback(
		async (newVisibility: "public" | "private") => {
			if (!workspace || !workspaceData || newVisibility === visibilityValue)
				return;
			setVisibilityValue(newVisibility);
			try {
				await updateWorkspace({
					workspaceId: workspace.workspaceId,
					visibility: newVisibility,
				});
				toast.success(
					`Workspace is now ${newVisibility === "public" ? "public" : "private"}`,
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update visibility",
				);
				setVisibilityValue(workspaceData.visibility ?? "public");
			}
		},
		[workspace, workspaceData, visibilityValue, updateWorkspace],
	);

	const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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

		const src = URL.createObjectURL(file);
		setLogoCropSrc((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return src;
		});
		setLogoCropOpen(true);
		event.target.value = "";
	};

	const handleLogoCropComplete = async (blob: Blob) => {
		if (!workspace) return;

		const nextUrl = URL.createObjectURL(blob);
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
				headers: { "Content-Type": blob.type },
				body: blob,
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
						<ImageCropDialog
							open={logoCropOpen}
							onOpenChange={setLogoCropOpen}
							imageSrc={logoCropSrc}
							cropShape="rect"
							title="Crop workspace logo"
							onCropComplete={handleLogoCropComplete}
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

			{isAdmin && (
				<SettingSection title="Access">
					<SettingRow
						label="Visibility"
						description="Controls whether org members can discover and join this workspace without an invite."
					>
						<div className="flex gap-2 max-w-xs">
							<button
								type="button"
								onClick={() => handleVisibilityChange("public")}
								className={cn(
									"flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer",
									visibilityValue === "public"
										? "border-primary bg-primary/5 text-foreground"
										: "border-border text-muted-foreground hover:bg-accent",
								)}
							>
								<Globe className="h-4 w-4" />
								Public
							</button>
							<button
								type="button"
								onClick={() => handleVisibilityChange("private")}
								className={cn(
									"flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors cursor-pointer",
									visibilityValue === "private"
										? "border-primary bg-primary/5 text-foreground"
										: "border-border text-muted-foreground hover:bg-accent",
								)}
							>
								<Lock className="h-4 w-4" />
								Private
							</button>
						</div>
						<p className="text-xs text-muted-foreground">
							{visibilityValue === "public"
								? "Anyone with the link can discover and join this workspace."
								: "Only invited members can access this workspace."}
						</p>
					</SettingRow>
				</SettingSection>
			)}
		</div>
	);
}
