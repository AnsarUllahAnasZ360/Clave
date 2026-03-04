"use client";

import { useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowLeftRight,
	Check,
	RefreshCw,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type IssueSyncSettingsProps = {
	projectId: Id<"projects">;
	connectionId: Id<"githubConnections">;
};

const STATUS_MAP = [
	{ github: "open", clave: "todo", note: "(or in_progress if assigned)" },
	{ github: "closed", clave: "done", note: "" },
	{ github: "open + 'triage' label", clave: "triage", note: "" },
	{ github: "open + 'backlog' label", clave: "backlog", note: "" },
	{ github: "closed + 'cancelled' label", clave: "cancelled", note: "" },
];

export function IssueSyncSettings({
	projectId,
	connectionId,
}: IssueSyncSettingsProps) {
	const connection = useQuery(api.github.getConnection, { projectId });
	const syncMappings = useQuery(api.githubSync.listIssueSyncMappings, {
		projectId,
	});
	const updateSettings = useMutation(api.github.updateSyncSettings);
	const toggleSync = useMutation(api.githubSync.toggleIssueSync);

	const [toggling, setToggling] = useState(false);

	const issueSyncEnabled = connection?.issueSyncEnabled ?? false;
	const prSyncEnabled = connection?.prSyncEnabled !== false;
	const commitSyncEnabled = connection?.commitSyncEnabled !== false;

	const syncedCount =
		syncMappings?.filter((m) => m.syncStatus === "synced").length ?? 0;
	const conflictCount =
		syncMappings?.filter((m) => m.syncStatus === "conflict").length ?? 0;
	const errorCount =
		syncMappings?.filter((m) => m.syncStatus === "error").length ?? 0;

	const handleToggleIssueSync = useCallback(
		async (enabled: boolean) => {
			setToggling(true);
			try {
				await toggleSync({ connectionId, enabled });
				toast.success(enabled ? "Issue sync enabled" : "Issue sync disabled");
			} catch {
				toast.error("Failed to update sync setting");
			} finally {
				setToggling(false);
			}
		},
		[toggleSync, connectionId],
	);

	const handleTogglePrSync = useCallback(
		async (enabled: boolean) => {
			try {
				await updateSettings({ connectionId, prSyncEnabled: enabled });
			} catch {
				toast.error("Failed to update setting");
			}
		},
		[updateSettings, connectionId],
	);

	const handleToggleCommitSync = useCallback(
		async (enabled: boolean) => {
			try {
				await updateSettings({
					connectionId,
					commitSyncEnabled: enabled,
				});
			} catch {
				toast.error("Failed to update setting");
			}
		},
		[updateSettings, connectionId],
	);

	if (connection === undefined) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Sync toggles */}
			<div className="rounded-lg border border-border bg-card p-4 space-y-4">
				<h3 className="text-sm font-semibold">Sync settings</h3>

				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm">Pull request sync</Label>
							<p className="text-xs text-muted-foreground">
								Automatically sync PRs from GitHub
							</p>
						</div>
						<Switch
							checked={prSyncEnabled}
							onCheckedChange={handleTogglePrSync}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm">Commit sync</Label>
							<p className="text-xs text-muted-foreground">
								Sync commits from the default branch
							</p>
						</div>
						<Switch
							checked={commitSyncEnabled}
							onCheckedChange={handleToggleCommitSync}
						/>
					</div>

					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm">Two-way issue sync</Label>
							<p className="text-xs text-muted-foreground">
								Sync issues between GitHub and Clave
							</p>
						</div>
						<Switch
							checked={issueSyncEnabled}
							onCheckedChange={handleToggleIssueSync}
							disabled={toggling}
						/>
					</div>
				</div>
			</div>

			{/* Status mapping table */}
			{issueSyncEnabled && (
				<div className="rounded-lg border border-border bg-card p-4 space-y-3">
					<h3 className="text-sm font-semibold">Status mapping</h3>
					<div className="text-xs text-muted-foreground">
						How statuses map between GitHub and Clave
					</div>

					<div className="rounded-md border border-border overflow-hidden">
						<table className="w-full text-xs">
							<thead>
								<tr className="border-b border-border bg-muted/30">
									<th className="px-3 py-2 text-left font-medium text-muted-foreground">
										GitHub
									</th>
									<th className="px-3 py-2 text-center font-medium text-muted-foreground">
										<ArrowLeftRight className="h-3 w-3 mx-auto" />
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground">
										Clave
									</th>
								</tr>
							</thead>
							<tbody>
								{STATUS_MAP.map((row) => (
									<tr
										key={row.clave}
										className="border-b border-border/40 last:border-0"
									>
										<td className="px-3 py-1.5">
											<code className="bg-muted/50 px-1 rounded">
												{row.github}
											</code>
										</td>
										<td className="px-3 py-1.5 text-center text-muted-foreground">
											<ArrowLeftRight className="h-3 w-3 mx-auto" />
										</td>
										<td className="px-3 py-1.5">
											<code className="bg-muted/50 px-1 rounded">
												{row.clave}
											</code>
											{row.note && (
												<span className="text-muted-foreground ml-1">
													{row.note}
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Sync status summary */}
			{issueSyncEnabled && syncMappings && (
				<div className="rounded-lg border border-border bg-card p-4 space-y-3">
					<h3 className="text-sm font-semibold">Sync status</h3>

					<div className="flex items-center gap-4">
						<div className="flex items-center gap-1.5">
							<Check className="h-3.5 w-3.5 text-emerald-400" />
							<span className="text-xs text-muted-foreground">
								{syncedCount} synced
							</span>
						</div>

						{conflictCount > 0 && (
							<div className="flex items-center gap-1.5">
								<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
								<span className="text-xs text-amber-400">
									{conflictCount} conflicts
								</span>
							</div>
						)}

						{errorCount > 0 && (
							<div className="flex items-center gap-1.5">
								<X className="h-3.5 w-3.5 text-red-400" />
								<span className="text-xs text-red-400">
									{errorCount} errors
								</span>
							</div>
						)}
					</div>

					{/* Conflict items */}
					{conflictCount > 0 && (
						<div className="space-y-1.5">
							<p className="text-xs text-muted-foreground font-medium">
								Conflicts (both sides changed)
							</p>
							{syncMappings
								.filter((m) => m.syncStatus === "conflict")
								.map((m) => (
									<div
										key={m._id}
										className="flex items-center justify-between px-3 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/20"
									>
										<div className="flex items-center gap-2">
											<AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
											<a
												href={m.githubIssueUrl}
												target="_blank"
												rel="noopener noreferrer"
												className="text-xs hover:underline"
											>
												GitHub #{m.githubIssueNumber}
											</a>
										</div>
										<Badge
											variant="outline"
											className="text-[10px] text-amber-400 border-amber-500/20"
										>
											Conflict
										</Badge>
									</div>
								))}
						</div>
					)}

					{connection?.lastIssueSyncAt && (
						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<RefreshCw className="h-3 w-3" />
							Last synced{" "}
							{new Date(connection.lastIssueSyncAt).toLocaleString()}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
