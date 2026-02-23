"use client";

import {
	BuildingOffice,
	Plus,
	ShieldCheck,
	SignIn,
	TrashSimple,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PixelLogo } from "@/components/marketing/pixel-logo";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { CreateOrganizationDialog } from "@/components/workspace/create-organization-dialog";
import { JoinOrganizationDialog } from "@/components/workspace/join-organization-dialog";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type OrganizationSummary = {
	_id: Id<"organizations">;
	name: string;
	slug: string;
	description?: string;
};

const orgColors = [
	"bg-blue-800",
	"bg-emerald-800",
	"bg-violet-800",
	"bg-amber-800",
	"bg-rose-800",
	"bg-cyan-800",
	"bg-indigo-800",
];

function getOrgColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++)
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	return orgColors[Math.abs(hash) % orgColors.length];
}

function OrganizationCard({
	org,
	workspaceCount,
	onDelete,
	isDeleting,
}: {
	org: OrganizationSummary;
	workspaceCount: number;
	onDelete: () => void;
	isDeleting: boolean;
}) {
	const router = useRouter();
	const myRole = useQuery(api.organizationMembers.myRole, {
		organizationId: org._id,
	});

	const canDelete = myRole?.role === "owner";

	return (
		<Card
			className="group h-full cursor-pointer border-border/60 transition-all hover:border-foreground/15 hover:shadow-md"
			role="link"
			tabIndex={0}
			onClick={() => router.push(`/organizations/${org.slug}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/organizations/${org.slug}`);
				}
			}}
		>
			<CardHeader className="space-y-3 pb-3">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3 min-w-0">
						<div
							className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${getOrgColor(org.name)} text-white shadow-[inset_0_-5px_6.6px_0_rgba(0,0,0,0.25)]`}
						>
							<span className="text-sm font-bold">
								{org.name[0]?.toUpperCase()}
							</span>
						</div>
						<div className="min-w-0">
							<CardTitle className="truncate text-base">{org.name}</CardTitle>
							<CardDescription className="mt-0.5 truncate text-xs">
								/{org.slug}
							</CardDescription>
						</div>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						{myRole?.role && (
							<Badge
								variant="secondary"
								className="capitalize text-[11px] px-1.5 py-0"
							>
								{myRole.role}
							</Badge>
						)}
						{canDelete && (
							// biome-ignore lint/a11y/noStaticElementInteractions: event propagation blocker for nested interactive
							<div
								onClick={(e) => e.stopPropagation()}
								onKeyDown={(e) => e.stopPropagation()}
							>
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<button
											type="button"
											className="rounded-md p-1.5 text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
										>
											<TrashSimple className="h-3.5 w-3.5" />
										</button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>Delete {org.name}?</AlertDialogTitle>
											<AlertDialogDescription>
												This soft-deletes the organization and removes it from
												your list.
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>Cancel</AlertDialogCancel>
											<AlertDialogAction
												className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												onClick={onDelete}
												disabled={isDeleting}
											>
												{isDeleting ? "Deleting..." : "Delete"}
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							</div>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				<p className="line-clamp-2 text-sm text-muted-foreground mb-3">
					{org.description?.trim() || "No description yet."}
				</p>
				<div className="text-xs text-muted-foreground/70">
					{workspaceCount} workspace{workspaceCount === 1 ? "" : "s"}
				</div>
			</CardContent>
		</Card>
	);
}

export default function OrganizationsPage() {
	const user = useQuery(api.users.current);
	const organizations = useQuery(api.organizations.list);
	const workspaces = useQuery(api.workspaces.list);
	const removeOrganization = useMutation(api.organizations.remove);

	const [createOrgOpen, setCreateOrgOpen] = useState(false);
	const [joinOrgOpen, setJoinOrgOpen] = useState(false);
	const [deletingOrgId, setDeletingOrgId] =
		useState<Id<"organizations"> | null>(null);

	const workspaceCountByOrg = useMemo(() => {
		const map = new Map<string, number>();
		if (!workspaces) return map;

		for (const workspace of workspaces) {
			if (!workspace.organizationId) continue;
			const key = workspace.organizationId as string;
			map.set(key, (map.get(key) ?? 0) + 1);
		}

		return map;
	}, [workspaces]);

	const handleDelete = async (organizationId: Id<"organizations">) => {
		setDeletingOrgId(organizationId);
		try {
			await removeOrganization({ organizationId });
			toast.success("Organization deleted");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to delete organization",
			);
		} finally {
			setDeletingOrgId(null);
		}
	};

	const loading = organizations === undefined || workspaces === undefined;

	return (
		<>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
				<div className="flex flex-col items-center gap-4 pt-8 pb-4">
					<div className="text-foreground">
						<PixelLogo color="currentColor" cellSize={8} gap={2} />
					</div>
					<p className="text-sm text-muted-foreground font-medium tracking-widest uppercase">
						Build in sync.
					</p>
				</div>

				<header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h1 className="text-xl font-semibold tracking-tight">
							Organizations
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Create, join, and manage your organizations.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{user?.role === "superadmin" && (
							<Button asChild variant="outline" size="sm" className="gap-1.5">
								<a href="/admin">
									<ShieldCheck className="h-3.5 w-3.5" />
									Admin
								</a>
							</Button>
						)}
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={() => setJoinOrgOpen(true)}
						>
							<SignIn className="h-3.5 w-3.5" />
							Join
						</Button>
						<Button
							size="sm"
							className="gap-1.5"
							onClick={() => setCreateOrgOpen(true)}
						>
							<Plus className="h-3.5 w-3.5" />
							Create
						</Button>
					</div>
				</header>

				{loading ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3].map((item) => (
							<div
								key={item}
								className="h-44 animate-pulse rounded-xl border border-border bg-muted/30"
							/>
						))}
					</div>
				) : organizations && organizations.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{organizations.map((org: OrganizationSummary) => (
							<OrganizationCard
								key={org._id}
								org={org}
								workspaceCount={workspaceCountByOrg.get(org._id as string) ?? 0}
								onDelete={() => handleDelete(org._id)}
								isDeleting={deletingOrgId === org._id}
							/>
						))}
					</div>
				) : (
					<Card className="border-dashed">
						<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
								<BuildingOffice className="h-6 w-6" />
							</div>
							<div>
								<p className="text-base font-medium">No organizations yet</p>
								<p className="mt-1 text-sm text-muted-foreground">
									Create a new organization or join an existing one with an
									invite code.
								</p>
							</div>
							<div className="flex flex-wrap items-center justify-center gap-2">
								<Button variant="outline" onClick={() => setJoinOrgOpen(true)}>
									Join organization
								</Button>
								<Button onClick={() => setCreateOrgOpen(true)}>
									Create organization
								</Button>
							</div>
						</CardContent>
					</Card>
				)}
			</div>

			<CreateOrganizationDialog
				open={createOrgOpen}
				onOpenChange={setCreateOrgOpen}
			/>
			<JoinOrganizationDialog
				open={joinOrgOpen}
				onOpenChange={setJoinOrgOpen}
			/>
		</>
	);
}
