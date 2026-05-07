import type { LucideIcon } from "lucide-react";
import {
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Bug,
	Circle,
	CircleCheck,
	CircleDashed,
	CircleDot,
	CircleX,
	Eye,
	Lightbulb,
	Minus,
	SignalHigh,
	Sparkles,
	Timer,
	TriangleAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

export type DefaultStatusKey =
	| "triage"
	| "backlog"
	| "todo"
	| "in_progress"
	| "in_review"
	| "done"
	| "cancelled";

export type StatusKey = string;

/**
 * Status categories — the 5-bucket model used to group statuses across
 * projects on workspace-wide views. Mirrors `statusCategoryValidator` in
 * convex/schema.ts. Every status (workspace default or project custom) maps
 * to exactly one category. Cross-project kanban groups by these 5 buckets;
 * single-project boards use the project's specific status keys as columns.
 */
export type StatusCategory =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

export const STATUS_CATEGORY_ORDER: StatusCategory[] = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
	backlog: "Backlog",
	unstarted: "Not started",
	started: "In progress",
	completed: "Done",
	canceled: "Cancelled",
};

/**
 * Visual config for category-grouped kanban columns. Mirrors the look-and-feel
 * of the canonical default status of each category (so the column header for
 * "In progress" feels like the familiar `in_progress` chip the user already
 * knows). Hex colors match the per-status hex map in
 * `src/hooks/use-workspace-settings.ts` to stay visually consistent across
 * the app.
 */
export const STATUS_CATEGORY_COLUMN_CONFIG: Record<
	StatusCategory,
	{ icon: LucideIcon; colorHex: string }
> = {
	backlog: { icon: CircleDashed, colorHex: "#6b7280" },
	unstarted: { icon: Circle, colorHex: "#a3a3a3" },
	started: { icon: Timer, colorHex: "#3b82f6" },
	completed: { icon: CircleCheck, colorHex: "#10b981" },
	canceled: { icon: CircleX, colorHex: "#ef4444" },
};

export type PriorityKey = "no_priority" | "low" | "medium" | "high" | "urgent";

export type DefaultIssueTypeKey = "issue" | "bug" | "improvement" | "feature";

export type IssueTypeKey = string;

export interface IssueConfigItem {
	key: string;
	name: string;
	icon: LucideIcon;
	color: string; // Tailwind class e.g. "text-orange-500"
	/** Status items only — undefined for type/priority items. */
	category?: StatusCategory;
}

// ── Default Statuses (7) ──────────────────────────────────────────────────

export const DEFAULT_STATUSES: (IssueConfigItem & { key: DefaultStatusKey })[] =
	[
		{
			key: "triage",
			name: "Triage",
			icon: TriangleAlert,
			color: "text-orange-500",
			category: "backlog",
		},
		{
			key: "backlog",
			name: "Backlog",
			icon: CircleDashed,
			color: "text-muted-foreground",
			category: "backlog",
		},
		{
			key: "todo",
			name: "Todo",
			icon: Circle,
			color: "text-muted-foreground",
			category: "unstarted",
		},
		{
			key: "in_progress",
			name: "In progress",
			icon: Timer,
			color: "text-yellow-500",
			category: "started",
		},
		{
			key: "in_review",
			name: "In review",
			icon: Eye,
			color: "text-blue-500",
			category: "started",
		},
		{
			key: "done",
			name: "Done",
			icon: CircleCheck,
			color: "text-emerald-500",
			category: "completed",
		},
		{
			key: "cancelled",
			name: "Cancelled",
			icon: CircleX,
			color: "text-muted-foreground",
			category: "canceled",
		},
	];

// ── Default Priorities (5) ────────────────────────────────────────────────

export const DEFAULT_PRIORITIES: (IssueConfigItem & { key: PriorityKey })[] = [
	{
		key: "no_priority",
		name: "No priority",
		icon: Minus,
		color: "text-muted-foreground",
	},
	{ key: "low", name: "Low", icon: ArrowDown, color: "text-blue-400" },
	{
		key: "medium",
		name: "Medium",
		icon: ArrowRight,
		color: "text-yellow-500",
	},
	{ key: "high", name: "High", icon: ArrowUp, color: "text-orange-500" },
	{
		key: "urgent",
		name: "Urgent",
		icon: SignalHigh,
		color: "text-red-500",
	},
];

// ── Default Issue Types (4) ───────────────────────────────────────────────

export const DEFAULT_ISSUE_TYPES: (IssueConfigItem & {
	key: DefaultIssueTypeKey;
})[] = [
	{
		key: "issue",
		name: "Issue",
		icon: CircleDot,
		color: "text-muted-foreground",
	},
	{ key: "bug", name: "Bug", icon: Bug, color: "text-red-500" },
	{
		key: "improvement",
		name: "Improvement",
		icon: Lightbulb,
		color: "text-yellow-500",
	},
	{
		key: "feature",
		name: "Feature",
		icon: Sparkles,
		color: "text-violet-500",
	},
];

// ── Lookup functions ──────────────────────────────────────────────────────

export function getStatusConfig(
	key: string,
): IssueConfigItem & { key: StatusKey } {
	return (
		DEFAULT_STATUSES.find((s) => s.key === key) ?? {
			key: key as StatusKey,
			name: key,
			icon: Circle,
			color: "text-muted-foreground",
		}
	);
}

export function getPriorityConfig(
	key: string,
): IssueConfigItem & { key: PriorityKey } {
	return (
		DEFAULT_PRIORITIES.find((p) => p.key === key) ?? {
			key: key as PriorityKey,
			name: key,
			icon: Minus,
			color: "text-muted-foreground",
		}
	);
}

export function getTypeConfig(
	key: string,
): IssueConfigItem & { key: IssueTypeKey } {
	return (
		DEFAULT_ISSUE_TYPES.find((t) => t.key === key) ?? {
			key: key as IssueTypeKey,
			name: key,
			icon: CircleDot,
			color: "text-muted-foreground",
		}
	);
}

// ── Picker arrays (for dropdowns and modals) ──────────────────────────────

export const STATUS_ITEMS = DEFAULT_STATUSES.map((s) => ({
	id: s.key,
	label: s.name,
	icon: s.icon,
	color: s.color,
}));

export const PRIORITY_ITEMS = DEFAULT_PRIORITIES.map((p) => ({
	id: p.key,
	label: p.name,
	icon: p.icon,
	color: p.color,
}));

export const TYPE_ITEMS = DEFAULT_ISSUE_TYPES.map((t) => ({
	id: t.key,
	label: t.name,
	icon: t.icon,
	color: t.color,
}));

// ── Record lookups (keyed by status/priority/type key) ────────────────

export const STATUS_RECORD: Record<
	string,
	{ label: string; icon: LucideIcon; color: string }
> = Object.fromEntries(
	DEFAULT_STATUSES.map((s) => [
		s.key,
		{ label: s.name, icon: s.icon, color: s.color },
	]),
);

export const PRIORITY_RECORD: Record<
	string,
	{ label: string; icon: LucideIcon; color: string }
> = Object.fromEntries(
	DEFAULT_PRIORITIES.map((p) => [
		p.key,
		{ label: p.name, icon: p.icon, color: p.color },
	]),
);

export const TYPE_RECORD: Record<
	string,
	{ label: string; icon: LucideIcon; color: string }
> = Object.fromEntries(
	DEFAULT_ISSUE_TYPES.map((t) => [
		t.key,
		{ label: t.name, icon: t.icon, color: t.color },
	]),
);

// ── Ordering (for sorts and swimlanes) ───────────────────────────────

export const STATUS_ORDER: Record<string, number> = Object.fromEntries(
	DEFAULT_STATUSES.map((s, i) => [s.key, i]),
);

export const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	no_priority: 4,
};

// ── Label-only lookups ───────────────────────────────────────────────

export const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(
	DEFAULT_PRIORITIES.map((p) => [p.key, p.name]),
);

// ── Timeline bar colors ─────────────────────────────────────────────

export const TIMELINE_BAR_COLORS: Record<string, string> = {
	triage: "bg-orange-500/20 border-orange-500/40",
	backlog: "bg-muted border-border",
	todo: "bg-muted border-border",
	in_progress: "bg-yellow-500/20 border-yellow-500/40",
	in_review: "bg-blue-500/20 border-blue-500/40",
	done: "bg-emerald-500/20 border-emerald-500/40",
	cancelled: "bg-muted/50 border-border/50",
};

// ── Dashboard bar colors ────────────────────────────────────────────

export const STATUS_BAR_COLORS: Record<string, string> = {
	triage: "bg-muted-foreground/40",
	backlog: "bg-muted-foreground/40",
	todo: "bg-blue-500",
	in_progress: "bg-yellow-500",
	in_review: "bg-orange-500",
	done: "bg-emerald-500",
	cancelled: "bg-muted-foreground/30",
};

// ── Color palette for settings ────────────────────────────────────────────

export const COLOR_PALETTE = [
	"#ef4444",
	"#f97316",
	"#f59e0b",
	"#eab308",
	"#84cc16",
	"#22c55e",
	"#10b981",
	"#14b8a6",
	"#06b6d4",
	"#3b82f6",
	"#6366f1",
	"#8b5cf6",
	"#a855f7",
	"#d946ef",
	"#ec4899",
	"#6b7280",
];
