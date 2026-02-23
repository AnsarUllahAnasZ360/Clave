"use client";

import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { UserDetailSheet } from "@/components/admin/UserDetailSheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
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
	return formatDate(timestamp);
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

export default function AdminUsersPage() {
	const users = useQuery(api.admin.listUsers);
	const [search, setSearch] = useState("");
	const [roleFilter, setRoleFilter] = useState<string>("all");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(
		null,
	);

	const filtered = useMemo(() => {
		if (!users) return [];
		return users.filter((user) => {
			// Search filter
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = user.name?.toLowerCase().includes(q) ?? false;
				const emailMatch = user.email?.toLowerCase().includes(q) ?? false;
				if (!nameMatch && !emailMatch) return false;
			}
			// Role filter
			if (roleFilter === "superadmin" && user.role !== "superadmin")
				return false;
			if (roleFilter === "regular" && user.role === "superadmin") return false;
			// Status filter
			if (statusFilter === "active" && user.suspended) return false;
			if (statusFilter === "suspended" && !user.suspended) return false;
			return true;
		});
	}, [users, search, roleFilter, statusFilter]);

	return (
		<div className="flex flex-1 flex-col gap-6 p-6">
			<div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-zinc-100 shadow-sm">
				<div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-zinc-400/10 blur-2xl" />
				<div className="relative">
					<p className="text-xs uppercase tracking-[0.28em] text-zinc-400">
						Users
					</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight">
						Platform Identity Control
					</h2>
					<p className="mt-2 text-sm text-zinc-300">
						Edit profiles, assign superadmins, remove access, and open org
						context for support sessions.
					</p>
				</div>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/70 p-3">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by name or email..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Select value={roleFilter} onValueChange={setRoleFilter}>
					<SelectTrigger className="w-[150px]">
						<SelectValue placeholder="Role" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Roles</SelectItem>
						<SelectItem value="regular">Regular</SelectItem>
						<SelectItem value="superadmin">Superadmin</SelectItem>
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
			{users === undefined ? (
				<TableSkeleton />
			) : (
				<div className="rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead className="text-center">Orgs</TableHead>
								<TableHead className="text-center">Workspaces</TableHead>
								<TableHead>Last Active</TableHead>
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
										{users.length === 0
											? "No users yet"
											: "No users match your filters"}
									</TableCell>
								</TableRow>
							) : (
								filtered.map((user) => (
									<TableRow
										key={user._id}
										className="cursor-pointer"
										onClick={() => setSelectedUserId(user._id)}
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<Avatar className="h-8 w-8">
													{user.image && (
														<AvatarImage
															src={user.image}
															alt={user.name ?? ""}
														/>
													)}
													<AvatarFallback className="text-xs">
														{getInitials(user.name ?? user.email ?? "?")}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">
													{user.name ?? "Unnamed"}
												</span>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.email ?? "—"}
										</TableCell>
										<TableCell>
											{user.role === "superadmin" ? (
												<Badge variant="default">Superadmin</Badge>
											) : (
												<Badge variant="outline">Regular</Badge>
											)}
										</TableCell>
										<TableCell className="text-center">
											{user.orgCount}
										</TableCell>
										<TableCell className="text-center">
											{user.workspaceCount}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{user.lastActiveAt
												? formatRelativeTime(user.lastActiveAt)
												: "Never"}
										</TableCell>
										<TableCell>
											{user.suspended ? (
												<Badge variant="destructive">Suspended</Badge>
											) : (
												<Badge variant="outline">Active</Badge>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(user.createdAt)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Detail Sheet */}
			<UserDetailSheet
				userId={selectedUserId}
				open={selectedUserId !== null}
				onOpenChange={(open) => {
					if (!open) setSelectedUserId(null);
				}}
			/>
		</div>
	);
}
