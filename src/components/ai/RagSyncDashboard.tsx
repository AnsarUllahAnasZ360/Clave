"use client";

import {
	ArrowClockwise,
	ChatCircle,
	CheckCircle,
	CircleNotch,
	Code,
	FileText,
	GitBranch,
	GithubLogo,
	ListBullets,
	Warning,
	XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type RagSyncDashboardProps = {
	projectId: Id<"projects">;
};

type SourceTypeStats = {
	synced: number;
	pending: number;
	error: number;
	lastSyncedAt: number | null;
	totalChunks: number;
};

const SOURCE_TYPE_CONFIG = {
	issue: {
		label: "Issues",
		icon: ListBullets,
		description: "Issue titles, descriptions, and metadata",
	},
	document: {
		label: "Documents",
		icon: FileText,
		description: "Plate editor document content",
	},
	comment: {
		label: "Comments",
		icon: ChatCircle,
		description: "Issue and task comments",
	},
	github_file: {
		label: "Code",
		icon: Code,
		description: "GitHub repository files",
	},
} as const;

export function RagSyncDashboard({ projectId }: RagSyncDashboardProps) {
	// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
	const ragStats = useQuery((api as any).ai.ragDashboard.getRagStats, {
		projectId,
	}) as
		| {
				issue: SourceTypeStats;
				document: SourceTypeStats;
				comment: SourceTypeStats;
				github_file: SourceTypeStats;
				totalChunks: number;
		  }
		| null
		| undefined;

	// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
	const health = useQuery((api as any).ai.ragDashboard.getIndexingHealth, {
		projectId,
	}) as
		| {
				isHealthy: boolean;
				pendingCount: number;
				errorCount: number;
				oldestPendingAt: number | null;
				totalItems: number;
		  }
		| null
		| undefined;

	const backfillStatus = useQuery(
		// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
		(api as any).ai.backfillQueries.getBackfillStatus,
		{
			projectId,
		},
	) as BackfillStatusData | null | undefined;

	// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
	const connection = useQuery((api as any).github.getConnection, { projectId });

	const startBackfill = useMutation(
		// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
		(api as any).ai.backfillQueries.startBackfill,
	);
	const triggerGithubSync = useMutation(
		// biome-ignore lint/suspicious/noExplicitAny: api types not yet generated for new file
		(api as any).github.triggerInitialIndex,
	);

	const { isAdmin } = useWorkspaceRole();

	const [isReindexing, setIsReindexing] = useState(false);

	const handleReindexAll = useCallback(async () => {
		setIsReindexing(true);
		try {
			await startBackfill({ projectId });
			toast.success("Backfill started — indexing all project content");
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Failed to start backfill";
			toast.error(msg);
		} finally {
			setIsReindexing(false);
		}
	}, [startBackfill, projectId]);

	const handleGithubSync = useCallback(async () => {
		if (!connection) return;
		try {
			await triggerGithubSync({
				connectionId: connection._id,
				projectId,
			});
			toast.success("GitHub sync triggered");
		} catch {
			toast.error("Failed to trigger GitHub sync");
		}
	}, [triggerGithubSync, connection, projectId]);

	const isLoading = ragStats === undefined || health === undefined;

	if (isLoading) {
		return <DashboardSkeleton />;
	}

	// No data yet — show empty state
	if (!ragStats || !health) {
		return (
			<div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-foreground">
							AI Knowledge Index
						</h3>
						<p className="text-xs text-muted-foreground mt-1">
							No content has been indexed yet. Trigger a re-index to build the
							AI knowledge base for this project.
						</p>
					</div>
					{isAdmin && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleReindexAll}
							disabled={isReindexing}
							className="gap-1.5 text-xs shrink-0"
						>
							{isReindexing ? (
								<CircleNotch className="h-3.5 w-3.5 animate-spin" />
							) : (
								<ArrowClockwise className="h-3.5 w-3.5" />
							)}
							Index All Content
						</Button>
					)}
				</div>
			</div>
		);
	}

	const isBackfillRunning = backfillStatus?.status === "running";

	return (
		<div className="space-y-4">
			{/* Header row: title + health badge + action */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5">
					<h3 className="text-sm font-semibold text-foreground">
						AI Knowledge Index
					</h3>
					<HealthBadge health={health} />
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{ragStats.totalChunks.toLocaleString()} chunks indexed
					</span>
					{isAdmin && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleReindexAll}
							disabled={isReindexing || isBackfillRunning}
							className="gap-1.5 text-xs h-7"
						>
							{isReindexing || isBackfillRunning ? (
								<CircleNotch className="h-3.5 w-3.5 animate-spin" />
							) : (
								<ArrowClockwise className="h-3.5 w-3.5" />
							)}
							Re-index All
						</Button>
					)}
				</div>
			</div>

			{/* Backfill progress bar (shown when running) */}
			{isBackfillRunning && backfillStatus && (
				<BackfillProgress status={backfillStatus} />
			)}

			{/* Content type stat cards grid */}
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
				{(
					Object.entries(SOURCE_TYPE_CONFIG) as [
						keyof typeof SOURCE_TYPE_CONFIG,
						(typeof SOURCE_TYPE_CONFIG)[keyof typeof SOURCE_TYPE_CONFIG],
					][]
				).map(([type, config]) => {
					const stats = ragStats[type];
					return <ContentTypeCard key={type} config={config} stats={stats} />;
				})}
			</div>

			{/* GitHub connection status */}
			<GitHubStatus
				connection={connection}
				onSync={handleGithubSync}
				isAdmin={isAdmin}
			/>
		</div>
	);
}

// ── Health Badge ────────────────────────────────────────────────────────────

function HealthBadge({
	health,
}: {
	health: {
		isHealthy: boolean;
		pendingCount: number;
		errorCount: number;
		totalItems: number;
	};
}) {
	if (health.totalItems === 0) {
		return (
			<Badge variant="muted" className="text-[10px] gap-1 px-1.5 py-0">
				Empty
			</Badge>
		);
	}

	if (health.errorCount > 0) {
		return (
			<Badge variant="destructive" className="text-[10px] gap-1 px-1.5 py-0">
				<XCircle className="h-3 w-3" />
				{health.errorCount} error{health.errorCount !== 1 ? "s" : ""}
			</Badge>
		);
	}

	if (health.pendingCount > 0) {
		return (
			<Badge className="text-[10px] gap-1 px-1.5 py-0 bg-amber-500/90 hover:bg-amber-500/90 text-white">
				<CircleNotch className="h-3 w-3 animate-spin" />
				Syncing
			</Badge>
		);
	}

	return (
		<Badge className="text-[10px] gap-1 px-1.5 py-0 bg-emerald-500/90 hover:bg-emerald-500/90 text-white">
			<CheckCircle className="h-3 w-3" />
			Up to date
		</Badge>
	);
}

// ── Content Type Card ──────────────────────────────────────────────────────

function ContentTypeCard({
	config,
	stats,
}: {
	config: { label: string; icon: React.ElementType; description: string };
	stats: SourceTypeStats;
}) {
	const Icon = config.icon;
	const total = stats.synced + stats.pending + stats.error;

	return (
		<div className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5">
					<Icon className="h-3.5 w-3.5 text-muted-foreground" />
					<span className="text-xs font-medium">{config.label}</span>
				</div>
				{stats.pending > 0 && (
					<span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
						<CircleNotch className="h-2.5 w-2.5 animate-spin" />
						{stats.pending}
					</span>
				)}
				{stats.error > 0 && (
					<span className="flex items-center gap-1 text-[10px] text-destructive">
						<Warning className="h-2.5 w-2.5" />
						{stats.error}
					</span>
				)}
			</div>

			<div className="flex items-baseline gap-1">
				<span className="text-lg font-semibold tabular-nums leading-none">
					{total}
				</span>
				<span className="text-[10px] text-muted-foreground">
					items · {stats.totalChunks} chunks
				</span>
			</div>

			<div className="text-[10px] text-muted-foreground">
				{stats.lastSyncedAt
					? `Synced ${formatDistanceToNow(stats.lastSyncedAt, { addSuffix: true })}`
					: "Never synced"}
			</div>
		</div>
	);
}

// ── Backfill Progress ──────────────────────────────────────────────────────

type BackfillStatusData = {
	status: string;
	progressPercent: number;
	issuesTotal?: number;
	issuesIndexed?: number;
	documentsTotal?: number;
	documentsIndexed?: number;
	commentsTotal?: number;
	commentsIndexed?: number;
	startedAt: number;
};

function BackfillProgress({ status }: { status: BackfillStatusData }) {
	const phases = [
		{
			label: "Issues",
			total: status.issuesTotal ?? 0,
			done: status.issuesIndexed ?? 0,
		},
		{
			label: "Documents",
			total: status.documentsTotal ?? 0,
			done: status.documentsIndexed ?? 0,
		},
		{
			label: "Comments",
			total: status.commentsTotal ?? 0,
			done: status.commentsIndexed ?? 0,
		},
	];

	const activePhase = phases.find((p) => p.total > 0 && p.done < p.total);
	const elapsed = formatDistanceToNow(status.startedAt, { addSuffix: false });

	return (
		<div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
			<div className="flex items-center justify-between text-xs">
				<span className="font-medium text-amber-700 dark:text-amber-300">
					{activePhase
						? `Indexing ${activePhase.label.toLowerCase()}... ${activePhase.done}/${activePhase.total}`
						: "Finishing up..."}
				</span>
				<span className="text-muted-foreground">{elapsed} elapsed</span>
			</div>
			<Progress value={status.progressPercent} className="h-1.5" />
			<div className="flex gap-3 text-[10px] text-muted-foreground">
				{phases
					.filter((p) => p.total > 0)
					.map((p) => (
						<span
							key={p.label}
							className={cn(
								p.done >= p.total && "text-emerald-600 dark:text-emerald-400",
							)}
						>
							{p.label}: {p.done}/{p.total}
						</span>
					))}
			</div>
		</div>
	);
}

// ── GitHub Status ──────────────────────────────────────────────────────────

function GitHubStatus({
	connection,
	onSync,
	isAdmin,
}: {
	connection:
		| {
				_id: Id<"githubConnections">;
				repoOwner: string;
				repoName: string;
				defaultBranch: string;
				status: string;
				lastSyncAt?: number;
		  }
		| null
		| undefined;
	onSync: () => void;
	isAdmin: boolean;
}) {
	if (connection === undefined) return null; // loading
	if (!connection) {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-dashed border-border/60 p-3">
				<GithubLogo className="h-4 w-4 text-muted-foreground" />
				<span className="text-xs text-muted-foreground">
					No GitHub repository connected. Connect one from the project overview
					to index your codebase.
				</span>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-3">
			<div className="flex items-center gap-2.5">
				<GithubLogo className="h-4 w-4 text-muted-foreground" />
				<div className="space-y-0.5">
					<div className="flex items-center gap-1.5 text-xs font-medium">
						{connection.repoOwner}/{connection.repoName}
						<span className="flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
							<GitBranch className="h-2.5 w-2.5" />
							{connection.defaultBranch}
						</span>
					</div>
					<div className="text-[10px] text-muted-foreground">
						{connection.lastSyncAt
							? `Last synced ${formatDistanceToNow(connection.lastSyncAt, { addSuffix: true })}`
							: "Not yet synced"}
						{connection.status === "error" && (
							<span className="ml-1.5 text-destructive">
								<Warning className="inline h-2.5 w-2.5" /> Connection error
							</span>
						)}
					</div>
				</div>
			</div>
			{isAdmin && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onSync}
					className="gap-1.5 text-xs h-7"
				>
					<ArrowClockwise className="h-3.5 w-3.5" />
					Sync Now
				</Button>
			)}
		</div>
	);
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function DashboardSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<div className="h-4 w-32 animate-pulse rounded bg-muted" />
					<div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
				</div>
				<div className="h-7 w-24 animate-pulse rounded bg-muted" />
			</div>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
				{[1, 2, 3, 4, 5].map((i) => (
					<div
						key={i}
						className="h-20 animate-pulse rounded-lg border border-border/60 bg-muted/50"
					/>
				))}
			</div>
			<div className="h-12 animate-pulse rounded-lg border border-border/60 bg-muted/50" />
		</div>
	);
}
