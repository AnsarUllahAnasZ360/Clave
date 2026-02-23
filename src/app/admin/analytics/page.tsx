"use client";

import {
	Buildings,
	ChartLine,
	Globe,
	Lock,
	ShieldCheck,
	SquaresFour,
	UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "convex/react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../convex/_generated/api";

// ── Chart Configs ────────────────────────────────────────────────────────

const growthConfig = {
	users: { label: "Users", color: "hsl(var(--chart-1))" },
	organizations: { label: "Organizations", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const activeUsersConfig = {
	activeUsers: { label: "Active Users", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

const planConfig = {
	free: { label: "Free", color: "hsl(var(--chart-1))" },
	pro: { label: "Pro", color: "hsl(var(--chart-2))" },
	enterprise: { label: "Enterprise", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

const topOrgsConfig = {
	members: { label: "Members", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig;

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDateShort(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ChartSkeleton() {
	return (
		<div className="flex h-[300px] items-center justify-center">
			<Skeleton className="h-full w-full rounded-lg" />
		</div>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex h-[300px] items-center justify-center">
			<p className="text-sm text-muted-foreground">{message}</p>
		</div>
	);
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
	const growth = useQuery(api.admin.getGrowthMetrics);
	const activeUsers = useQuery(api.admin.getActiveUserMetrics);
	const planDist = useQuery(api.admin.getPlanDistribution);
	const topOrgs = useQuery(api.admin.getTopOrganizations);
	const wsStats = useQuery(api.admin.getWorkspaceStats);
	const health = useQuery(api.admin.getAnalyticsHealth);

	const planPieData =
		planDist !== undefined
			? [
					{ name: "free", value: planDist.free, fill: "hsl(var(--chart-1))" },
					{ name: "pro", value: planDist.pro, fill: "hsl(var(--chart-2))" },
					{
						name: "enterprise",
						value: planDist.enterprise,
						fill: "hsl(var(--chart-3))",
					},
				].filter((d) => d.value > 0)
			: [];

	const totalPlans = planDist
		? planDist.free + planDist.pro + planDist.enterprise
		: 0;

	return (
		<div className="flex flex-1 flex-col gap-6 p-6">
			<div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-6 text-zinc-100 shadow-sm">
				<div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-zinc-400/10 blur-2xl" />
				<div className="relative">
					<p className="text-xs uppercase tracking-[0.28em] text-zinc-400">
						Analytics
					</p>
					<h2 className="mt-2 text-2xl font-semibold tracking-tight">
						Platform Intelligence
					</h2>
					<p className="mt-2 text-sm text-zinc-300">
						Growth, activity, plan mix, and integrity checks generated from live
						platform data.
					</p>
				</div>
			</div>

			{/* Row 1: Growth Chart (full width) */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ChartLine className="h-5 w-5" />
						User &amp; Organization Growth
					</CardTitle>
					<CardDescription>Daily signups over the last 30 days</CardDescription>
				</CardHeader>
				<CardContent>
					{growth === undefined ? (
						<ChartSkeleton />
					) : growth.every((d) => d.users === 0 && d.organizations === 0) ? (
						<EmptyState message="No signups in the last 30 days" />
					) : (
						<ChartContainer config={growthConfig} className="h-[300px] w-full">
							<AreaChart data={growth} accessibilityLayer>
								<CartesianGrid vertical={false} />
								<XAxis
									dataKey="date"
									tickFormatter={formatDateShort}
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									interval="preserveStartEnd"
								/>
								<YAxis
									tickLine={false}
									axisLine={false}
									allowDecimals={false}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											labelFormatter={(value) =>
												formatDateShort(value as string)
											}
										/>
									}
								/>
								<ChartLegend content={<ChartLegendContent />} />
								<Area
									dataKey="users"
									type="monotone"
									fill="var(--color-users)"
									stroke="var(--color-users)"
									fillOpacity={0.3}
									strokeWidth={2}
								/>
								<Area
									dataKey="organizations"
									type="monotone"
									fill="var(--color-organizations)"
									stroke="var(--color-organizations)"
									fillOpacity={0.3}
									strokeWidth={2}
								/>
							</AreaChart>
						</ChartContainer>
					)}
				</CardContent>
			</Card>

			{/* Row 2: Active Users + Plan Distribution */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Active Users */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<UsersThree className="h-5 w-5" />
							Active Users
						</CardTitle>
						<CardDescription>
							Unique daily active users over the last 14 days
						</CardDescription>
					</CardHeader>
					<CardContent>
						{activeUsers === undefined ? (
							<ChartSkeleton />
						) : activeUsers.every((d) => d.activeUsers === 0) ? (
							<EmptyState message="No active users in the last 14 days" />
						) : (
							<ChartContainer
								config={activeUsersConfig}
								className="h-[300px] w-full"
							>
								<BarChart data={activeUsers} accessibilityLayer>
									<CartesianGrid vertical={false} />
									<XAxis
										dataKey="date"
										tickFormatter={formatDateShort}
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										interval="preserveStartEnd"
									/>
									<YAxis
										tickLine={false}
										axisLine={false}
										allowDecimals={false}
									/>
									<ChartTooltip
										content={
											<ChartTooltipContent
												labelFormatter={(value) =>
													formatDateShort(value as string)
												}
											/>
										}
									/>
									<Bar
										dataKey="activeUsers"
										fill="var(--color-activeUsers)"
										radius={[4, 4, 0, 0]}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>

				{/* Plan Distribution */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Buildings className="h-5 w-5" />
							Plan Distribution
						</CardTitle>
						<CardDescription>
							Organizations by plan ({totalPlans} total)
						</CardDescription>
					</CardHeader>
					<CardContent>
						{planDist === undefined ? (
							<ChartSkeleton />
						) : totalPlans === 0 ? (
							<EmptyState message="No organizations yet" />
						) : (
							<ChartContainer
								config={planConfig}
								className="mx-auto h-[300px] w-full max-w-[360px]"
							>
								<PieChart accessibilityLayer>
									<ChartTooltip content={<ChartTooltipContent hideLabel />} />
									<Pie
										data={planPieData}
										dataKey="value"
										nameKey="name"
										cx="50%"
										cy="50%"
										innerRadius={60}
										outerRadius={100}
										paddingAngle={2}
									>
										{planPieData.map((entry) => (
											<Cell key={entry.name} fill={entry.fill} />
										))}
									</Pie>
									<ChartLegend
										content={<ChartLegendContent nameKey="name" />}
									/>
								</PieChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Row 3: Top Organizations + Workspace Stats */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Top Organizations */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Buildings className="h-5 w-5" />
							Top Organizations
						</CardTitle>
						<CardDescription>By member count (top 10)</CardDescription>
					</CardHeader>
					<CardContent>
						{topOrgs === undefined ? (
							<ChartSkeleton />
						) : topOrgs.length === 0 ? (
							<EmptyState message="No organizations yet" />
						) : (
							<ChartContainer
								config={topOrgsConfig}
								className="h-[300px] w-full"
							>
								<BarChart data={topOrgs} layout="vertical" accessibilityLayer>
									<CartesianGrid horizontal={false} />
									<XAxis
										type="number"
										tickLine={false}
										axisLine={false}
										allowDecimals={false}
									/>
									<YAxis
										dataKey="name"
										type="category"
										tickLine={false}
										axisLine={false}
										width={120}
										tickFormatter={(value: string) =>
											value.length > 15 ? `${value.slice(0, 15)}...` : value
										}
									/>
									<ChartTooltip content={<ChartTooltipContent />} />
									<Bar
										dataKey="members"
										fill="var(--color-members)"
										radius={[0, 4, 4, 0]}
									/>
								</BarChart>
							</ChartContainer>
						)}
					</CardContent>
				</Card>

				{/* Workspace Stats */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<SquaresFour className="h-5 w-5" />
							Workspace Stats
						</CardTitle>
						<CardDescription>Workspace visibility breakdown</CardDescription>
					</CardHeader>
					<CardContent>
						{wsStats === undefined ? (
							<div className="space-y-6">
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
								<Skeleton className="h-20 w-full" />
							</div>
						) : (
							<div className="space-y-6">
								<div className="flex items-center justify-between rounded-lg border p-4">
									<div className="flex items-center gap-3">
										<SquaresFour className="h-5 w-5 text-muted-foreground" />
										<div>
											<p className="text-sm font-medium">Total Workspaces</p>
											<p className="text-xs text-muted-foreground">
												All active workspaces
											</p>
										</div>
									</div>
									<span className="text-2xl font-bold tabular-nums">
										{wsStats.total}
									</span>
								</div>
								<div className="flex items-center justify-between rounded-lg border p-4">
									<div className="flex items-center gap-3">
										<Globe className="h-5 w-5 text-muted-foreground" />
										<div>
											<p className="text-sm font-medium">Public</p>
											<p className="text-xs text-muted-foreground">
												Discoverable by org members
											</p>
										</div>
									</div>
									<span className="text-2xl font-bold tabular-nums">
										{wsStats.public}
									</span>
								</div>
								<div className="flex items-center justify-between rounded-lg border p-4">
									<div className="flex items-center gap-3">
										<Lock className="h-5 w-5 text-muted-foreground" />
										<div>
											<p className="text-sm font-medium">Private</p>
											<p className="text-xs text-muted-foreground">
												Invite-only access
											</p>
										</div>
									</div>
									<span className="text-2xl font-bold tabular-nums">
										{wsStats.private}
									</span>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Row 4: Analytics QA Checks */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5" />
						Analytics QA
					</CardTitle>
					<CardDescription>
						Consistency checks for dashboard metric integrity
					</CardDescription>
				</CardHeader>
				<CardContent>
					{health === undefined ? (
						<div className="space-y-3">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
						</div>
					) : (
						<div className="space-y-3">
							<div className="flex items-center justify-between rounded-lg border px-3 py-2">
								<p className="text-sm text-muted-foreground">
									Last check {new Date(health.generatedAt).toLocaleString()}
								</p>
								<Badge variant={health.healthy ? "outline" : "destructive"}>
									{health.healthy ? "Healthy" : "Attention Required"}
								</Badge>
							</div>
							{health.checks.map((check) => (
								<div
									key={check.id}
									className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2"
								>
									<div>
										<p className="text-sm font-medium">{check.label}</p>
										<p className="text-xs text-muted-foreground">
											Expected {check.expected} · Actual {check.actual}
										</p>
									</div>
									<Badge variant={check.ok ? "outline" : "destructive"}>
										{check.ok ? "Pass" : "Fail"}
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
