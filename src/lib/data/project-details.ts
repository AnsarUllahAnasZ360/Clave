import { getAvatarUrl } from "@/lib/assets/avatars";
import type { Project as ProjectListItem } from "@/lib/data/projects";
import { projects } from "@/lib/data/projects";

function addDays(base: Date, days: number): Date {
	const d = new Date(base);
	d.setDate(d.getDate() + days);
	return d;
}

export type User = {
	id: string;
	name: string;
	avatarUrl?: string;
	role?: string;
};

export type ProjectMeta = {
	priorityLabel: string;
	locationLabel: string;
	sprintLabel: string;
	lastSyncLabel: string;
};

export type ProjectScope = {
	inScope: string[];
	outOfScope: string[];
};

export type KeyFeatures = {
	p0: string[];
	p1: string[];
	p2: string[];
};

export type TimelineTask = {
	id: string;
	name: string;
	startDate: Date;
	endDate: Date;
	status: "planned" | "in-progress" | "done";
};

export type WorkstreamTaskStatus = "todo" | "in-progress" | "done";

export type WorkstreamTask = {
	id: string;
	name: string;
	status: WorkstreamTaskStatus;
	dueLabel?: string;
	dueTone?: "danger" | "warning" | "muted";
	assignee?: User;
	/** Optional start date for the task (used in task views). */
	startDate?: Date;
	/** Optional priority identifier for the task. */
	priority?: "no-priority" | "low" | "medium" | "high" | "urgent";
	/** Optional tag label for the task (e.g. Feature, Bug). */
	tag?: string;
	/** Optional short description used in task lists. */
	description?: string;
};

export type WorkstreamGroup = {
	id: string;
	name: string;
	tasks: WorkstreamTask[];
};

export type ProjectTask = WorkstreamTask & {
	projectId: string;
	projectName: string;
	workstreamId: string;
	workstreamName: string;
};

export type TimeSummary = {
	estimateLabel: string;
	dueDate: Date;
	daysRemainingLabel: string;
	progressPercent: number;
};

export type BacklogSummary = {
	statusLabel: "Active" | "Backlog" | "Planned" | "Completed" | "Cancelled";
	groupLabel: string;
	priorityLabel: string;
	labelBadge: string;
	picUsers: User[];
	supportUsers?: User[];
};

export type QuickLink = {
	id: string;
	name: string;
	type: "pdf" | "zip" | "fig" | "doc" | "file";
	sizeMB: number;
	url: string;
};

export type ProjectFile = QuickLink & {
	addedBy: User;
	addedDate: Date;
	description?: string;
	isLinkAsset?: boolean;
	attachments?: QuickLink[];
};

export type ProjectDetails = {
	id: string;
	name: string;
	description: string;
	meta: ProjectMeta;
	scope: ProjectScope;
	outcomes: string[];
	keyFeatures: KeyFeatures;
	timelineTasks: TimelineTask[];
	workstreams: WorkstreamGroup[];
	time: TimeSummary;
	backlog: BacklogSummary;
	files: ProjectFile[];
	source?: ProjectListItem;
};

export function getProjectTasks(details: ProjectDetails): ProjectTask[] {
	const workstreams = details.workstreams ?? [];

	return workstreams.flatMap((group) =>
		group.tasks.map((task) => ({
			...task,
			projectId: details.id,
			projectName: details.name,
			workstreamId: group.id,
			workstreamName: group.name,
		})),
	);
}

function userFromName(name: string, role?: string): User {
	return {
		id: name.trim().toLowerCase().replace(/\s+/g, "-"),
		name,
		avatarUrl: getAvatarUrl(name),
		role,
	};
}

function baseDetailsFromListItem(p: ProjectListItem): ProjectDetails {
	const picUsers = p.members.length
		? p.members.map((n) => userFromName(n, "PIC"))
		: [userFromName("Jason Duong", "PIC")];
	const today = new Date();

	return {
		id: p.id,
		name: p.name,
		description: p.client
			? `Project for ${p.client}. This is mock content that will be replaced by API later.`
			: "This is mock content that will be replaced by API later.",
		meta: {
			priorityLabel: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
			locationLabel: "Australia",
			sprintLabel:
				p.typeLabel && p.durationLabel
					? `${p.typeLabel} ${p.durationLabel}`
					: (p.durationLabel ?? "MVP 2 weeks"),
			lastSyncLabel: "Just now",
		},
		scope: {
			inScope: [
				"Define scope",
				"Draft solution",
				"Validate with stakeholders",
				"Prepare handoff",
			],
			outOfScope: ["Backend logic changes", "Marketing landing pages"],
		},
		outcomes: [
			"Reduce steps and improve usability",
			"Increase success rate",
			"Deliver production-ready UI",
		],
		keyFeatures: {
			p0: ["Core user flow"],
			p1: ["Filters and empty states"],
			p2: ["Visual polish"],
		},
		workstreams: [
			{
				id: `${p.id}-ws-1`,
				name: "Initial discovery & alignment",
				tasks: [
					{
						id: `${p.id}-ws-1-t1`,
						name: "Kickoff with stakeholders",
						status: "done",
						dueLabel: "Today",
						dueTone: "muted",
						assignee: picUsers[0],
						startDate: today,
					},
					{
						id: `${p.id}-ws-1-t2`,
						name: "Define problem statement",
						status: "in-progress",
						dueLabel: "Tomorrow",
						dueTone: "warning",
						assignee: picUsers[0],
						startDate: addDays(today, 1),
					},
					{
						id: `${p.id}-ws-1-t3`,
						name: "Collect existing assets",
						status: "todo",
						startDate: addDays(today, 2),
					},
				],
			},
			{
				id: `${p.id}-ws-2`,
				name: "Design & validation",
				tasks: [
					{
						id: `${p.id}-ws-2-t1`,
						name: "Draft wireframes",
						status: "todo",
						startDate: addDays(today, 3),
					},
					{
						id: `${p.id}-ws-2-t2`,
						name: "Review with team",
						status: "todo",
						startDate: addDays(today, 4),
					},
				],
			},
		],
		timelineTasks: [
			{
				id: `${p.id}-t1`,
				name: "Audit existing flows",
				startDate: new Date(2025, 11, 22), // Mon
				endDate: new Date(2025, 11, 23), // Tue
				status: "done",
			},
			{
				id: `${p.id}-t2`,
				name: "Redesign onboarding & payment",
				startDate: new Date(2025, 11, 23), // Tue
				endDate: new Date(2025, 11, 25), // Thu
				status: "in-progress",
			},
			{
				id: `${p.id}-t3`,
				name: "Usability testing",
				startDate: new Date(2025, 11, 25), // Thu
				endDate: new Date(2025, 11, 27), // Sat
				status: "planned",
			},
			{
				id: `${p.id}-t4`,
				name: "Iterate based on feedback",
				startDate: new Date(2025, 11, 27), // Sat
				endDate: new Date(2025, 11, 28), // Sun
				status: "planned",
			},
		],
		time: {
			estimateLabel: "1 months",
			dueDate: new Date(2025, 11, 31),
			daysRemainingLabel: "21 Days to go",
			progressPercent: 75,
		},
		backlog: {
			statusLabel: "Active",
			groupLabel: "None",
			priorityLabel: p.priority.charAt(0).toUpperCase() + p.priority.slice(1),
			labelBadge: "Design",
			picUsers,
			supportUsers: [userFromName("Support", "Support")],
		},
		files: [],
		source: p,
	};
}

export function getProjectDetailsById(id: string): ProjectDetails {
	const base = projects.find((p) => p.id === id);

	const effectiveBase: ProjectListItem = base ?? {
		id,
		name: `Untitled project ${id}`,
		taskCount: 0,
		progress: 0,
		startDate: new Date(),
		endDate: new Date(),
		status: "planned",
		priority: "medium",
		tags: [],
		members: [],
		tasks: [],
	};

	const details = baseDetailsFromListItem(effectiveBase);

	if (base?.id === "1") {
		details.description =
			"The internal project aims to optimize user experience and interface for the PM System Core. The goal is to standardize UX, enhance usability, and create a design content repository for daily publication on social media.";

		details.scope = {
			inScope: [
				"UX research (existing users, light interviews)",
				"Core flows redesign (Onboarding, Payment, Transaction history)",
				"Design system (starter components)",
				"Usability fixes for critical flows",
			],
			outOfScope: [
				"New feature ideation",
				"Backend logic changes",
				"Marketing landing pages",
			],
		};

		details.outcomes = [
			"Reduce payment flow steps from 6 → 4",
			"Increase task success rate (usability test) from 70% → 90%",
			"Deliver production-ready UI for MVP build",
			"Enable dev handoff without design clarification loops",
		];

		details.keyFeatures = {
			p0: ["Onboarding & KYC flow", "Payment confirmation UX"],
			p1: ["Transaction history & filters", "Error / empty states"],
			p2: ["Visual polish & motion guidelines"],
		};

		const primaryAssignee = details.backlog.picUsers[0];
		const today = new Date();

		const filesBaseDate = new Date(2024, 8, 18);

		const files: ProjectFile[] = [
			{
				id: "file-1",
				name: "Proposal.pdf",
				type: "pdf",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
			{
				id: "file-2",
				name: "Wireframe Layout.zip",
				type: "zip",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
			{
				id: "file-3",
				name: "Design system.fig",
				type: "fig",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
			{
				id: "file-4",
				name: "UI Kit.fig",
				type: "fig",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
			{
				id: "file-5",
				name: "Asset.pdf",
				type: "pdf",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
			{
				id: "file-6",
				name: "Asset.pdf",
				type: "pdf",
				sizeMB: 13.0,
				url: "#",
				addedBy: primaryAssignee,
				addedDate: filesBaseDate,
			},
		];

		details.files = files;

		details.workstreams = [
			{
				id: "1-ws-1",
				name: "Processing documents for signing the deal",
				tasks: [
					{
						id: "1-ws-1-t1",
						name: "Processing documents for signing the deal",
						status: "done",
						dueLabel: "Today",
						dueTone: "muted",
						assignee: primaryAssignee,
						startDate: today,
					},
					{
						id: "1-ws-1-t2",
						name: "Internal approval & sign-off",
						status: "todo",
						dueLabel: "Today",
						dueTone: "danger",
						assignee: primaryAssignee,
						startDate: today,
					},
					{
						id: "1-ws-1-t3",
						name: "Send contract to client",
						status: "todo",
						dueLabel: "Tomorrow",
						dueTone: "warning",
						assignee: primaryAssignee,
						startDate: addDays(today, 1),
					},
					{
						id: "1-ws-1-t4",
						name: "Track client signature",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 2),
					},
				],
			},
			{
				id: "1-ws-2",
				name: "Client onboarding setup",
				tasks: [
					{
						id: "1-ws-2-t1",
						name: "Collect onboarding requirements",
						status: "in-progress",
						dueLabel: "This week",
						dueTone: "muted",
						assignee: primaryAssignee,
						startDate: addDays(today, 2),
					},
					{
						id: "1-ws-2-t2",
						name: "Configure sandbox account",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 3),
					},
					{
						id: "1-ws-2-t3",
						name: "Schedule onboarding session",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 4),
					},
				],
			},
			{
				id: "1-ws-3",
				name: "Product wireframe & review",
				tasks: [
					{
						id: "1-ws-3-t1",
						name: "Prepare low-fidelity wireframes",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 3),
					},
					{
						id: "1-ws-3-t2",
						name: "Review with stakeholders",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 4),
					},
				],
			},
			{
				id: "1-ws-4",
				name: "Demo UI Concept",
				tasks: [
					{
						id: "1-ws-4-t1",
						name: "Prepare clickable prototype",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 4),
					},
				],
			},
			{
				id: "1-ws-5",
				name: "Feedback and iteration with stakeholders",
				tasks: [
					{
						id: "1-ws-5-t1",
						name: "Collect feedback from stakeholders",
						status: "todo",
						assignee: primaryAssignee,
						startDate: addDays(today, 5),
					},
				],
			},
		];
	}

	return details;
}
