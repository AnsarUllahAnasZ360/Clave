import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { useWorkspaceSettings } from "@/hooks/use-workspace-settings";
import { getStatusConfig, getTypeConfig } from "@/lib/issue-config";
import type { Id } from "../../convex/_generated/dataModel";

type CustomItem = { key: string; name: string; color: string };

type ProjectLike = {
	customStatuses?: CustomItem[];
	customTypes?: CustomItem[];
};

function mergeWithCustom(base: CustomItem[], custom: CustomItem[] | undefined) {
	if (!custom || custom.length === 0) return base;
	const byKey = new Map(custom.map((c) => [c.key, c] as const));
	const merged = base.map((b) => byKey.get(b.key) ?? b);
	const customOnly = custom.filter((c) => !base.some((b) => b.key === c.key));
	return [...merged, ...customOnly];
}

export function useEffectiveIssueConfig(
	workspaceId: Id<"workspaces"> | undefined,
	project?: ProjectLike,
) {
	const ws = useWorkspaceSettings(workspaceId);

	return useMemo(() => {
		const types = mergeWithCustom(ws.types, project?.customTypes);
		const statuses = mergeWithCustom(ws.statuses, project?.customStatuses);

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

		return {
			...ws,
			types,
			statuses,
			getTypeName,
			getTypeColor,
			getTypeIcon,
			getStatusName,
			getStatusColor,
			getStatusIcon,
		};
	}, [project?.customStatuses, project?.customTypes, ws]);
}
