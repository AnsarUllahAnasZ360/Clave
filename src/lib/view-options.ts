export type ViewType = "list" | "board" | "timeline";

export type TaskViewMode = "indented" | "collapsed" | "flat";

export type Ordering = "manual" | "alphabetical" | "date";

export type GroupBy = "none" | "status" | "assignee" | "tags";

export type ViewOptions = {
	viewType: ViewType;
	tasks: TaskViewMode;
	ordering: Ordering;
	showAbsentParent: boolean;
	showClosedProjects: boolean;
	groupBy: GroupBy;
	properties: string[];
};

export type FilterChip = {
	key: string;
	value: string;
};

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
	viewType: "list",
	tasks: "indented",
	ordering: "manual",
	showAbsentParent: false,
	showClosedProjects: true,
	groupBy: "none",
	properties: ["title", "status", "assignee", "dueDate"],
};

export type ProjectGroup = {
	key: string;
	label: string;
	projects: import("@/lib/data/projects").Project[];
};

// ── localStorage persistence ─────────────────────────────────────────────────

const STORAGE_KEY = "clave:project-view-options";

export function loadViewOptions(): ViewOptions {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) return { ...DEFAULT_VIEW_OPTIONS, ...JSON.parse(stored) };
	} catch {
		/* ignore */
	}
	return DEFAULT_VIEW_OPTIONS;
}

export function saveViewOptions(options: ViewOptions): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
	} catch {
		/* ignore */
	}
}
