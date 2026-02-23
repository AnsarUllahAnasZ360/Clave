"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

function planBadgeVariant(plan: string) {
	switch (plan) {
		case "pro":
			return "default" as const;
		case "enterprise":
			return "secondary" as const;
		default:
			return "outline" as const;
	}
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

interface OrgDetailSheetProps {
	organizationId: Id<"organizations"> | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function OrgDetailSheet({
	organizationId,
	open,
	onOpenChange,
}: OrgDetailSheetProps) {
	const router = useRouter();
	const detail = useQuery(
		api.admin.getOrganizationDetail,
		organizationId ? { organizationId } : "skip",
	);
	const suspendOrg = useMutation(api.admin.suspendOrganization);
	const unsuspendOrg = useMutation(api.admin.unsuspendOrganization);
	const updatePlan = useMutation(api.admin.updateOrganizationPlan);
	const openOrganization = useMutation(api.admin.openOrganizationContext);
	const [isOpening, setIsOpening] = useState(false);

	const handleSuspendToggle = async () => {
		if (!organizationId) return;
		try {
			if (detail?.suspended) {
				await unsuspendOrg({ organizationId });
				toast.success("Organization unsuspended");
			} else {
				await suspendOrg({ organizationId });
				toast.success("Organization suspended");
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update organization",
			);
		}
	};

	const handlePlanChange = async (plan: "free" | "pro" | "enterprise") => {
		if (!organizationId) return;
		try {
			await updatePlan({ organizationId, plan });
			toast.success(`Plan updated to ${plan}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to update plan",
			);
		}
	};

	const handleOpenOrganization = async () => {
		if (!organizationId) return;
		setIsOpening(true);
		try {
			const destination = await openOrganization({ organizationId });
			toast.success("Opened organization context");
			onOpenChange(false);
			router.push(destination.path);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to open organization context",
			);
		} finally {
			setIsOpening(false);
		}
	};

	return (
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
									<AvatarFallback>{getInitials(detail.name)}</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<SheetTitle>{detail.name}</SheetTitle>
									<SheetDescription>/{detail.slug}</SheetDescription>
								</div>
							</div>
							<div className="flex items-center gap-2 pt-2">
								<Badge
									variant={planBadgeVariant(detail.plan)}
									className="capitalize"
								>
									{detail.plan}
								</Badge>
								{detail.suspended ? (
									<Badge variant="destructive">Suspended</Badge>
								) : (
									<Badge variant="outline">Active</Badge>
								)}
							</div>
							{detail.description && (
								<p className="text-sm text-muted-foreground pt-1">
									{detail.description}
								</p>
							)}
						</SheetHeader>

						{/* Actions */}
						<div className="flex items-center gap-3 px-4">
							<Button
								variant="outline"
								size="sm"
								disabled={isOpening}
								onClick={handleOpenOrganization}
							>
								{isOpening ? "Opening..." : "Open Organization"}
							</Button>
							<Button
								variant={detail.suspended ? "outline" : "destructive"}
								size="sm"
								onClick={handleSuspendToggle}
							>
								{detail.suspended ? "Unsuspend" : "Suspend"}
							</Button>
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted-foreground">Plan:</span>
								<Select
									value={detail.plan}
									onValueChange={(val) =>
										handlePlanChange(val as "free" | "pro" | "enterprise")
									}
								>
									<SelectTrigger className="w-[130px] h-8">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="free">Free</SelectItem>
										<SelectItem value="pro">Pro</SelectItem>
										<SelectItem value="enterprise">Enterprise</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						{/* Tabs */}
						<div className="px-4 pb-4 flex-1">
							<Tabs defaultValue="workspaces">
								<TabsList>
									<TabsTrigger value="workspaces">
										Workspaces ({detail.workspaces.length})
									</TabsTrigger>
									<TabsTrigger value="members">
										Members ({detail.members.length})
									</TabsTrigger>
								</TabsList>

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
													<Badge variant="outline">
														{ws.memberCount} member
														{ws.memberCount !== 1 ? "s" : ""}
													</Badge>
												</div>
											))}
										</div>
									)}
								</TabsContent>

								<TabsContent value="members" className="mt-4">
									{detail.members.length === 0 ? (
										<p className="text-sm text-muted-foreground">No members</p>
									) : (
										<div className="space-y-2">
											{detail.members.map((member) => (
												<div
													key={member.userId}
													className="flex items-center gap-3 rounded-md border px-3 py-2"
												>
													<Avatar className="h-8 w-8">
														<AvatarFallback className="text-xs">
															{getInitials(member.name)}
														</AvatarFallback>
													</Avatar>
													<div className="min-w-0 flex-1">
														<p className="text-sm font-medium truncate">
															{member.name}
														</p>
														<p className="text-xs text-muted-foreground truncate">
															{member.email}
														</p>
													</div>
													<Badge
														variant={roleBadgeVariant(member.role)}
														className="capitalize shrink-0"
													>
														{member.role}
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
	);
}
