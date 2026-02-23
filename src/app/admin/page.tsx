"use client";

import {
	Buildings,
	Lightning,
	ShieldCheck,
	SquaresFour,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../convex/_generated/api";

const kpiCards = [
	{
		title: "Total Users",
		key: "totalUsers" as const,
		icon: UsersThree,
		description: "Platform-wide registered users",
	},
	{
		title: "Organizations",
		key: "totalOrganizations" as const,
		icon: Buildings,
		description: "Active organizations",
	},
	{
		title: "Workspaces",
		key: "totalWorkspaces" as const,
		icon: SquaresFour,
		description: "Total workspaces created",
	},
	{
		title: "Active (24h)",
		key: "activeUsers24h" as const,
		icon: Lightning,
		description: "Users active in last 24 hours",
	},
];

const kpiCardStyles = {
	totalUsers: "border-l-4 border-l-sky-500/70",
	totalOrganizations: "border-l-4 border-l-emerald-500/70",
	totalWorkspaces: "border-l-4 border-l-amber-500/70",
	activeUsers24h: "border-l-4 border-l-violet-500/70",
} as const;

function formatTimestamp(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function ActivitySkeleton() {
	return (
		<div className="flex items-center gap-4">
			<Skeleton className="h-10 w-10 rounded-full" />
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-48" />
				<Skeleton className="h-3 w-32" />
			</div>
		</div>
	);
}

export default function AdminDashboardPage() {
	const stats = useQuery(api.admin.getStats);
	const activity = useQuery(api.admin.getRecentActivity);

	return (
		<div className="flex flex-1 flex-col gap-6 p-6">
			<div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-zinc-100 shadow-sm">
				<div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-zinc-400/10 blur-2xl" />
				<div className="relative space-y-2">
					<p className="text-xs uppercase tracking-[0.28em] text-zinc-400">
						Clave Control
					</p>
					<h2 className="text-2xl font-semibold tracking-tight">
						Platform Command Center
					</h2>
					<p className="max-w-2xl text-sm text-zinc-300">
						Track growth, enforce access policy, and operate every organization
						from one audited surface.
					</p>
				</div>
			</div>

			{/* KPI Cards */}
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
				{kpiCards.map((card) => (
					<Card key={card.key} className={kpiCardStyles[card.key]}>
						<CardHeader className="flex flex-row items-center justify-between pb-2">
							<CardDescription className="text-sm font-medium">
								{card.title}
							</CardDescription>
							<card.icon className="h-5 w-5 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							{stats === undefined ? (
								<Skeleton className="h-8 w-20" />
							) : (
								<div className="text-3xl font-bold tabular-nums">
									{stats[card.key].toLocaleString()}
								</div>
							)}
							<p className="mt-1 text-xs text-muted-foreground">
								{card.description}
							</p>
						</CardContent>
					</Card>
				))}
			</div>

			{/* Recent Activity */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5" />
						Recent Activity
					</CardTitle>
					<CardDescription>
						Latest signups and organization creations
					</CardDescription>
				</CardHeader>
				<CardContent>
					{activity === undefined ? (
						<div className="space-y-4">
							<ActivitySkeleton />
							<ActivitySkeleton />
							<ActivitySkeleton />
							<ActivitySkeleton />
							<ActivitySkeleton />
						</div>
					) : activity.length === 0 ? (
						<p className="text-sm text-muted-foreground">No recent activity</p>
					) : (
						<div className="space-y-4">
							{activity.map((item) => (
								<div
									key={`${item.type}-${item.id}`}
									className="flex items-center gap-4"
								>
									<Avatar className="h-10 w-10">
										<AvatarFallback className="text-xs">
											{item.type === "user_signup"
												? getInitials(item.name)
												: item.name.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate">{item.name}</p>
										<p className="text-xs text-muted-foreground">
											{item.type === "user_signup"
												? "Signed up"
												: "Organization created"}
											{" \u00B7 "}
											{formatTimestamp(item.timestamp)}
										</p>
									</div>
									<Badge variant="outline" className="shrink-0">
										{item.type === "user_signup" ? "User" : "Org"}
									</Badge>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
