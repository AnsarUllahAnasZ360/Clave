import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
	applyOrder,
	useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import { getStatusConfig, getTypeConfig } from "@/lib/issue-config";
import type { Id } from "../../convex/_generated/dataModel";

type CustomItem = { key: string; name: string; color: string };

type ProjectLike = {
	customStatuses?: CustomItem[];
	customTypes?: CustomItem[];
	customStatusOrder?: string[];
};

export type EffectivePickerItem = {
	id: string;
	label: string;
	icon: LucideIcon;
	/** Hex color (e.g. "#f97316"). Render via inline style, not Tailwind classes. */
	colorHex: string;
};

export function mergeWithCustom(
	base: CustomItem[],
	custom: CustomItem[] | undefined,
) {
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
		// Workspace statuses are already sorted by workspace `customStatusOrder`
		// (applied inside `useWorkspaceSettings`). Project-level overrides merge
		// in any project-specific custom statuses, and the project's own
		// `customStatusOrder` (if present) sorts the result for that scope.
		const mergedStatuses = mergeWithCustom(
			ws.statuses,
			project?.customStatuses,
		);
		const statuses = applyOrder(mergedStatuses, project?.customStatusOrder);

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

		const statusItems: EffectivePickerItem[] = statuses.map((s) => ({
			id: s.key,
			label: s.name,
			icon: getStatusConfig(s.key).icon,
			colorHex: s.color,
		}));

		const typeItems: EffectivePickerItem[] = types.map((t) => ({
			id: t.key,
			label: t.name,
			icon: getTypeConfig(t.key).icon,
			colorHex: t.color,
		}));

		const statusOrder: Record<string, number> = Object.fromEntries(
			statuses.map((s, i) => [s.key, i]),
		);

		const statusRecord: Record<
			string,
			{ label: string; icon: LucideIcon; colorHex: string }
		> = Object.fromEntries(
			statuses.map((s) => [
				s.key,
				{
					label: s.name,
					icon: getStatusConfig(s.key).icon,
					colorHex: s.color,
				},
			]),
		);

		return {
			...ws,
			types,
			statuses,
			statusItems,
			typeItems,
			statusOrder,
			statusRecord,
			getTypeName,
			getTypeColor,
			getTypeIcon,
			getStatusName,
			getStatusColor,
			getStatusIcon,
		};
	}, [
		project?.customStatuses,
		project?.customTypes,
		project?.customStatusOrder,
		ws,
	]);
}
