import { useQuery } from "convex/react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
	DEFAULT_ISSUE_TYPES,
	DEFAULT_PRIORITIES,
	DEFAULT_STATUSES,
	getPriorityConfig,
	getStatusConfig,
	getTypeConfig,
} from "@/lib/issue-config";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type CustomItem = { key: string; name: string; color: string };

// Hex color defaults for workspace settings (settings store hex, not Tailwind classes)
const TYPE_HEX: Record<string, string> = {
	issue: "#6b7280",
	bug: "#ef4444",
	improvement: "#f59e0b",
	feature: "#8b5cf6",
};

const STATUS_HEX: Record<string, string> = {
	triage: "#f97316",
	backlog: "#6b7280",
	todo: "#a3a3a3",
	in_progress: "#3b82f6",
	in_review: "#8b5cf6",
	done: "#10b981",
	cancelled: "#ef4444",
};

const PRIORITY_HEX: Record<string, string> = {
	no_priority: "#6b7280",
	low: "#3b82f6",
	medium: "#f59e0b",
	high: "#f97316",
	urgent: "#ef4444",
};

// ── Hook ───────────────────────────────────────────────────────────────────

function mergeDefaults(
	defaults: CustomItem[],
	custom: CustomItem[] | undefined,
): CustomItem[] {
	if (!custom || custom.length === 0) return defaults;
	const merged = defaults.map((def) => {
		const override = custom.find((c) => c.key === def.key);
		return override ?? def;
	});
	const customOnly = custom.filter(
		(c) => !defaults.some((d) => d.key === c.key),
	);
	return [...merged, ...customOnly];
}

export function useWorkspaceSettings(
	workspaceId: Id<"workspaces"> | undefined,
) {
	const settings = useQuery(
		api.workspaceSettings.get,
		workspaceId ? { workspaceId } : "skip",
	);

	return useMemo(() => {
		const issueTypeDefaults: CustomItem[] = DEFAULT_ISSUE_TYPES.map((t) => ({
			key: t.key,
			name: t.name,
			color: TYPE_HEX[t.key] ?? "#6b7280",
		}));
		const statusDefaults: CustomItem[] = DEFAULT_STATUSES.map((s) => ({
			key: s.key,
			name: s.name,
			color: STATUS_HEX[s.key] ?? "#6b7280",
		}));
		const priorityDefaults: CustomItem[] = DEFAULT_PRIORITIES.map((p) => ({
			key: p.key,
			name: p.name,
			color: PRIORITY_HEX[p.key] ?? "#6b7280",
		}));

		const types = mergeDefaults(issueTypeDefaults, settings?.customTypes);
		const statuses = mergeDefaults(statusDefaults, settings?.customStatuses);
		const priorities = mergeDefaults(
			priorityDefaults,
			settings?.customPriorities,
		);

		const getTypeName = (key: string) =>
			types.find((t) => t.key === key)?.name ?? key;
		const getTypeColor = (key: string) =>
			types.find((t) => t.key === key)?.color ?? "#6b7280";
		const getTypeIcon = (key: string): LucideIcon => getTypeConfig(key).icon;
		const getStatusName = (key: string) =>
			statuses.find((s) => s.key === key)?.name ?? key;
		const getStatusColor = (key: string) =>
			statuses.find((s) => s.key === key)?.color ?? "#6b7280";
		const getStatusIcon = (key: string): LucideIcon =>
			getStatusConfig(key).icon;
		const getPriorityName = (key: string) =>
			priorities.find((p) => p.key === key)?.name ?? key;
		const getPriorityColor = (key: string) =>
			priorities.find((p) => p.key === key)?.color ?? "#6b7280";
		const getPriorityIcon = (key: string): LucideIcon =>
			getPriorityConfig(key).icon;

		return {
			settings,
			types,
			statuses,
			priorities,
			getTypeName,
			getTypeColor,
			getTypeIcon,
			getStatusName,
			getStatusColor,
			getStatusIcon,
			getPriorityName,
			getPriorityColor,
			getPriorityIcon,
			isLoading: settings === undefined && workspaceId !== undefined,
		};
	}, [settings, workspaceId]);
}
