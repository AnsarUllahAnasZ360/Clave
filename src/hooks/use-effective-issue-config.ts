import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import {
	applyOrder,
	useWorkspaceSettings,
} from "@/hooks/use-workspace-settings";
import {
	DEFAULT_STATUSES,
	getStatusConfig,
	getTypeConfig,
	type StatusCategory,
} from "@/lib/issue-config";
import type { Id } from "../../convex/_generated/dataModel";
import { inferStatusCategory } from "../../convex/lib/statusCategory";

type CustomItem = {
	key: string;
	name: string;
	color: string;
	category?: StatusCategory;
};

type ProjectLike = {
	customStatuses?: CustomItem[];
	customTypes?: CustomItem[];
	customStatusOrder?: string[];
	/**
	 * Project-scoped exclusion list — status keys (built-in defaults or
	 * workspace customs) the project has hidden. Filtered out of the effective
	 * status set after merging defaults + workspace customs + project customs.
	 */
	hiddenStatusKeys?: string[];
};

export type EffectivePickerItem = {
	id: string;
	label: string;
	icon: LucideIcon;
	/** Hex color (e.g. "#f97316"). Render via inline style, not Tailwind classes. */
	colorHex: string;
	/** Status items only — undefined for type/priority items. */
	category?: StatusCategory;
};

const DEFAULT_STATUS_CATEGORY_BY_KEY: Record<string, StatusCategory> =
	Object.fromEntries(
		DEFAULT_STATUSES.filter(
			(s): s is typeof s & { category: StatusCategory } =>
				s.category !== undefined,
		).map((s) => [s.key, s.category]),
	);

/**
 * Resolve a status key to its category. Order of precedence:
 *   1) explicit `category` on the status definition (post-backfill state)
 *   2) hardcoded category for built-in default keys (`todo`, `in_progress`, …)
 *   3) heuristic inference from key/name (handles unbackfilled custom statuses)
 *
 * Always returns a valid category — never `undefined` — so renderers can safely
 * group by category without null-checks.
 */
export function resolveStatusCategory(
	def: { key: string; name?: string; category?: StatusCategory } | undefined,
	key: string,
): StatusCategory {
	if (def?.category) return def.category;
	const builtIn = DEFAULT_STATUS_CATEGORY_BY_KEY[key];
	if (builtIn) return builtIn;
	return inferStatusCategory({ key, name: def?.name });
}

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

type WorkspaceConfig = ReturnType<typeof useWorkspaceSettings>;

export type EffectiveIssueConfig = {
	types: CustomItem[];
	statuses: CustomItem[];
	statusItems: EffectivePickerItem[];
	typeItems: EffectivePickerItem[];
	statusOrder: Record<string, number>;
	statusRecord: Record<
		string,
		{
			label: string;
			icon: LucideIcon;
			colorHex: string;
			category: StatusCategory;
		}
	>;
	/** Status items grouped by category, for cross-project kanban columns. */
	statusesByCategory: Record<StatusCategory, EffectivePickerItem[]>;
	getTypeName: (key: string) => string;
	getTypeColor: (key: string) => string;
	getTypeIcon: (key: string) => LucideIcon;
	getStatusName: (key: string) => string;
	getStatusColor: (key: string) => string;
	getStatusIcon: (key: string) => LucideIcon;
	getStatusCategory: (key: string) => StatusCategory;
};

/**
 * Pure builder — given resolved workspace config + a project, produce the
 * effective config for that scope. Extracted from `useEffectiveIssueConfig`
 * so it can be reused inside loops (e.g. per-project map for cross-project
 * views like My Issues / Inbox). Exported for unit tests.
 */
export function buildEffectiveIssueConfig(
	ws: WorkspaceConfig,
	project: ProjectLike | undefined,
): EffectiveIssueConfig {
	const types = mergeWithCustom(ws.types, project?.customTypes);
	const mergedStatuses = mergeWithCustom(ws.statuses, project?.customStatuses);
	// Filter out keys the project has explicitly hidden (built-in defaults or
	// workspace customs the project doesn't use). Skipped when no exclusions
	// exist, to avoid an unnecessary array allocation on every render.
	const hidden = project?.hiddenStatusKeys;
	const visible =
		hidden && hidden.length > 0
			? mergedStatuses.filter((s) => !hidden.includes(s.key))
			: mergedStatuses;
	const statuses = applyOrder(visible, project?.customStatusOrder);

	const getTypeName = (key: string) =>
		types.find((t) => t.key === key)?.name ?? key;
	const getTypeColor = (key: string) =>
		types.find((t) => t.key === key)?.color ?? "#6b7280";
	const getTypeIcon = (key: string): LucideIcon => getTypeConfig(key).icon;

	const getStatusName = (key: string) =>
		statuses.find((s) => s.key === key)?.name ?? key;
	const getStatusColor = (key: string) =>
		statuses.find((s) => s.key === key)?.color ?? "#6b7280";
	const getStatusIcon = (key: string): LucideIcon => getStatusConfig(key).icon;
	const getStatusCategory = (key: string): StatusCategory =>
		resolveStatusCategory(
			statuses.find((s) => s.key === key),
			key,
		);

	const statusItems: EffectivePickerItem[] = statuses.map((s) => ({
		id: s.key,
		label: s.name,
		icon: getStatusConfig(s.key).icon,
		colorHex: s.color,
		category: resolveStatusCategory(s, s.key),
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
		{
			label: string;
			icon: LucideIcon;
			colorHex: string;
			category: StatusCategory;
		}
	> = Object.fromEntries(
		statuses.map((s) => [
			s.key,
			{
				label: s.name,
				icon: getStatusConfig(s.key).icon,
				colorHex: s.color,
				category: resolveStatusCategory(s, s.key),
			},
		]),
	);

	const statusesByCategory: Record<StatusCategory, EffectivePickerItem[]> = {
		backlog: [],
		unstarted: [],
		started: [],
		completed: [],
		canceled: [],
	};
	for (const item of statusItems) {
		const cat = item.category ?? "unstarted";
		statusesByCategory[cat].push(item);
	}

	return {
		types,
		statuses,
		statusItems,
		typeItems,
		statusOrder,
		statusRecord,
		statusesByCategory,
		getTypeName,
		getTypeColor,
		getTypeIcon,
		getStatusName,
		getStatusColor,
		getStatusIcon,
		getStatusCategory,
	};
}

export function useEffectiveIssueConfig(
	workspaceId: Id<"workspaces"> | undefined,
	project?: ProjectLike,
) {
	const ws = useWorkspaceSettings(workspaceId);

	return useMemo(() => {
		const built = buildEffectiveIssueConfig(ws, project);
		return { ...ws, ...built };
	}, [
		project?.customStatuses,
		project?.customTypes,
		project?.customStatusOrder,
		ws,
	]);
}

type IssueLike = {
	projectId?: Id<"projects"> | string | null;
	status: string;
};

export type ProjectsEffectiveConfigs = {
	/** Map<projectId, EffectiveIssueConfig> for resolution per-issue. */
	byProjectId: Map<string, EffectiveIssueConfig>;
	/** Workspace-only config, used when an issue has no projectId. */
	workspaceFallback: EffectiveIssueConfig;
	/**
	 * Resolve the correct config for an issue based on its projectId. Uses the
	 * project's effective config when known, else workspace fallback. The
	 * issue's status string is interpreted in that scope's dictionary.
	 */
	getConfigForIssue: (issue: IssueLike) => EffectiveIssueConfig;
	/**
	 * Resolve an issue's status category — reads the issue's project dictionary
	 * (falling back to workspace), looks up the status, and returns its
	 * category. Cross-project kanban groups cards by this value.
	 */
	getCategoryForIssue: (issue: IssueLike) => StatusCategory;
	/**
	 * Resolve `category → specific status string` for `issue`'s project. Used
	 * by cross-project kanban drag-drop: when the user drops a card into a
	 * category column, this picks the matching status from the issue's own
	 * project. Returns null if the project has no status in that category
	 * (caller should treat as a no-op rather than guessing).
	 */
	resolveStatusForCategory: (
		issue: IssueLike,
		category: StatusCategory,
	) => string | null;
	/**
	 * Every status in `issue`'s own project that maps to `category`, in the
	 * project's display order. Drag-drop uses this to decide whether to apply
	 * `resolveStatusForCategory` blindly (length === 1) or prompt the user
	 * with a picker (length > 1) since multiple statuses can share one bucket.
	 */
	getProjectStatusesInCategory: (
		issue: IssueLike,
		category: StatusCategory,
	) => EffectivePickerItem[];
	/**
	 * Union of all status keys across the workspace + every included project's
	 * customStatuses, deduped, ordered by workspace's natural order with any
	 * project-only keys appended in first-seen order.
	 *
	 * Used as the column axis for cross-project list view (status grouping)
	 * and the cross-project kanban board *only when grouping by status key*.
	 * For category-based cross-project grouping, use `STATUS_CATEGORY_ORDER`
	 * + `getCategoryForIssue` instead.
	 */
	unionStatusItems: EffectivePickerItem[];
	/** Position lookup over `unionStatusItems` for sort comparators. */
	unionStatusOrder: Record<string, number>;
	isLoading: boolean;
};

/**
 * Cross-project resolver. Used by views (My Issues, Inbox, AI panels) that
 * render issues from multiple projects on a single page. Each issue must be
 * resolved against its OWN project's dictionary, otherwise project-only
 * custom statuses (e.g. a "Testing in staging" only defined on Project X)
 * fall back to defaults and render as the wrong status.
 */
export function useProjectsEffectiveConfigs(
	workspaceId: Id<"workspaces"> | undefined,
	projects:
		| Array<
				ProjectLike & {
					_id: Id<"projects"> | string;
				}
		  >
		| undefined,
): ProjectsEffectiveConfigs {
	const ws = useWorkspaceSettings(workspaceId);

	return useMemo(() => {
		const workspaceFallback = buildEffectiveIssueConfig(ws, undefined);
		const byProjectId = new Map<string, EffectiveIssueConfig>();
		for (const p of projects ?? []) {
			byProjectId.set(p._id as string, buildEffectiveIssueConfig(ws, p));
		}

		const getConfigForIssue = (issue: IssueLike): EffectiveIssueConfig => {
			if (issue.projectId) {
				const cfg = byProjectId.get(issue.projectId as string);
				if (cfg) return cfg;
			}
			return workspaceFallback;
		};

		const getCategoryForIssue = (issue: IssueLike): StatusCategory =>
			getConfigForIssue(issue).getStatusCategory(issue.status);

		/**
		 * Pick the status string to apply to `issue` when the user drops it into
		 * a category column on a cross-project kanban. Resolves against the
		 * issue's *own* project's status list (so we never write a status the
		 * project doesn't recognize) and prefers the first status the project
		 * orders within that category.
		 *
		 * Returns null when no project status matches the target category — the
		 * caller should treat this as "no-op the drop" rather than guessing,
		 * since picking the wrong status would silently break workflows.
		 */
		const resolveStatusForCategory = (
			issue: IssueLike,
			category: StatusCategory,
		): string | null => {
			const cfg = getConfigForIssue(issue);
			// `statusItems` is already in the project's display order, so
			// `find` returns the project's preferred status for that bucket.
			const match = cfg.statusItems.find((s) => s.category === category);
			return match?.id ?? null;
		};

		const getProjectStatusesInCategory = (
			issue: IssueLike,
			category: StatusCategory,
		): EffectivePickerItem[] => {
			const cfg = getConfigForIssue(issue);
			return cfg.statusItems.filter((s) => s.category === category);
		};

		const seen = new Set<string>();
		const unionStatusItems: EffectivePickerItem[] = [];
		for (const item of workspaceFallback.statusItems) {
			if (seen.has(item.id)) continue;
			seen.add(item.id);
			unionStatusItems.push(item);
		}
		for (const cfg of byProjectId.values()) {
			for (const item of cfg.statusItems) {
				if (seen.has(item.id)) continue;
				seen.add(item.id);
				unionStatusItems.push(item);
			}
		}

		const unionStatusOrder: Record<string, number> = Object.fromEntries(
			unionStatusItems.map((s, i) => [s.id, i]),
		);

		return {
			byProjectId,
			workspaceFallback,
			getConfigForIssue,
			getCategoryForIssue,
			resolveStatusForCategory,
			getProjectStatusesInCategory,
			unionStatusItems,
			unionStatusOrder,
			isLoading: ws.isLoading,
		};
	}, [ws, projects]);
}
