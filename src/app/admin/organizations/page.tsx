"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { OrgDetailSheet } from "@/components/admin/OrgDetailSheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function planBadgeVariant(plan: string) {
	switch (plan) {
		case "pro":
			return "default";
		case "enterprise":
			return "secondary";
		default:
			return "outline";
	}
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function TableSkeleton() {
	return (
		<div className="space-y-3">
			{Array.from({ length: 5 }).map((_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: skeleton loader with static list
				<Skeleton key={`skeleton-${i}`} className="h-12 w-full" />
			))}
		</div>
	);
}

export default function AdminOrganizationsPage() {
	const organizations = useQuery(api.admin.listOrganizations);
	const [search, setSearch] = useState("");
	const [planFilter, setPlanFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [selectedOrgId, setSelectedOrgId] =
		useState<Id<"organizations"> | null>(null);

	const filtered = useMemo(() => {
		if (!organizations) return [];
		return organizations.filter((org) => {
			// Search filter
			if (search) {
				const q = search.toLowerCase();
				if (
					!org.name.toLowerCase().includes(q) &&
					!org.slug.toLowerCase().includes(q)
				) {
					return false;
				}
			}
			// Plan filter
			if (planFilter !== "all" && org.plan !== planFilter) {
				return false;
			}
			// Status filter
			if (statusFilter === "active" && org.suspended) return false;
			if (statusFilter === "suspended" && !org.suspended) return false;
			return true;
		});
	}, [organizations, search, planFilter, statusFilter]);

	return (
		<div className="flex flex-1 flex-col gap-6 p-6">
			<div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-zinc-100 shadow-sm">
				<div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-zinc-400/10 blur-2xl" />
				<div className="relative">
					<p className="text-xs uppercase tracking-[0.28em] text-zinc-400">
						Organizations
					</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight">
						Tenant Operations
					</h2>
					<p className="mt-2 text-sm text-zinc-300">
						Manage plan, status, members, and instant organization access from a
						single admin table.
					</p>
				</div>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/70 p-3">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by name or slug..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={planFilter} onValueChange={setPlanFilter}>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Plan" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Plans</SelectItem>
						<SelectItem value="free">Free</SelectItem>
						<SelectItem value="pro">Pro</SelectItem>
						<SelectItem value="enterprise">Enterprise</SelectItem>
					</SelectContent>
				</Select>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="w-[140px]">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Status</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="suspended">Suspended</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Table */}
			{organizations === undefined ? (
				<TableSkeleton />
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Slug</TableHead>
								<TableHead>Owner</TableHead>
								<TableHead>Plan</TableHead>
								<TableHead className="text-center">Members</TableHead>
								<TableHead className="text-center">Workspaces</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={8}
										className="h-24 text-center text-muted-foreground"
									>
										{organizations.length === 0
											? "No organizations yet"
											: "No organizations match your filters"}
									</TableCell>
								</TableRow>
							) : (
								filtered.map((org) => (
									<TableRow
										key={org._id}
										className="cursor-pointer"
										onClick={() => setSelectedOrgId(org._id)}
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<Avatar className="h-8 w-8">
													<AvatarFallback className="text-xs">
														{getInitials(org.name)}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">{org.name}</span>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{org.slug}
										</TableCell>
										<TableCell>{org.owner.name}</TableCell>
										<TableCell>
											<Badge
												variant={planBadgeVariant(org.plan)}
												className="capitalize"
											>
												{org.plan}
											</Badge>
										</TableCell>
										<TableCell className="text-center">
											{org.memberCount}
										</TableCell>
										<TableCell className="text-center">
											{org.workspaceCount}
										</TableCell>
										<TableCell>
											{org.suspended ? (
												<Badge variant="destructive">Suspended</Badge>
											) : (
												<Badge variant="outline">Active</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(org.createdAt)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Detail Sheet */}
			<OrgDetailSheet
				organizationId={selectedOrgId}
				open={selectedOrgId !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedOrgId(null);
				}}
			/>
		</div>
	);
}
