"use client";

import { CopySimple, Info, Spinner } from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { api } from "../../../convex/_generated/api";
import {
	PaneDescription,
	PaneTitle,
	SettingRow,
	SettingSection,
} from "./settings-shared";
export function AccountSettingsPane() {
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [cropSrc, setCropSrc] = useState<string | null>(null);
	const [cropOpen, setCropOpen] = useState(false);
	const { theme, setTheme } = useTheme();
	const [isMounted, setIsMounted] = useState(false);

	const user = useCurrentUser();
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

	const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
		setCropSrc((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return src;
		});
		setCropOpen(true);

		// Reset input so the same file can be re-selected
		event.target.value = "";
	};

	const handlePhotoCropComplete = async (blob: Blob) => {
		const nextUrl = URL.createObjectURL(blob);
		setObjectUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return nextUrl;
		});

		setIsUploading(true);
		try {
			const uploadUrl = await generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": blob.type },
				body: blob,
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
					<div className="flex items-center gap-3 rounded-lg border border-sienna-500/30 bg-sienna-500/10 px-4 py-3 mb-4">
						<div className="flex-1 text-sm text-sienna-600 dark:text-sienna-200">
							<span className="font-medium">Profile picture required.</span>{" "}
							Upload a photo so your team can recognize you.
						</div>
						<Button
							variant="outline"
							size="sm"
							className="h-8 px-3 text-xs shrink-0 border-sienna-500/30 text-sienna-600 hover:bg-sienna-500/20 dark:text-sienna-200"
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
							<ImageCropDialog
								open={cropOpen}
								onOpenChange={setCropOpen}
								imageSrc={cropSrc}
								cropShape="round"
								title="Crop profile photo"
								onCropComplete={handlePhotoCropComplete}
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
