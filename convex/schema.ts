import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	...authTables,

	// ── Core ──────────────────────────────────────────────────────────────────

	users: defineTable({
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		image: v.optional(v.string()),
		avatarStorageId: v.optional(v.id("_storage")),
		role: v.optional(v.string()),
		timezone: v.optional(v.string()),
		theme: v.optional(
			v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
		),
		locale: v.optional(v.string()),
		sidebarCollapsed: v.optional(v.boolean()),
		compactMode: v.optional(v.boolean()),
		notifyEmail: v.optional(v.boolean()),
		notifyPush: v.optional(v.boolean()),
		notifyInApp: v.optional(v.boolean()),
	}).index("by_email", ["email"]),

	workspaces: defineTable({
		name: v.string(),
		slug: v.string(),
		ownerId: v.id("users"),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_owner", ["ownerId"])
		.index("by_slug", ["slug"]),

	workspaceMembers: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
		joinedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_user", ["userId"])
		.index("by_workspace_user", ["workspaceId", "userId"]),

	workspaceSettings: defineTable({
		workspaceId: v.id("workspaces"),
		storyPrefix: v.string(),
		nextStoryNumber: v.number(),
		taskPrefix: v.optional(v.string()),
		nextTaskNumber: v.optional(v.number()),
		issuePrefix: v.optional(v.string()),
		nextIssueNumber: v.optional(v.number()),
		defaultProjectStatus: v.optional(v.string()),
		defaultStoryStatus: v.optional(v.string()),
		accentColor: v.optional(v.string()),
		customTypes: v.optional(
			v.array(v.object({ key: v.string(), name: v.string(), color: v.string() })),
		),
		customStatuses: v.optional(
			v.array(v.object({ key: v.string(), name: v.string(), color: v.string() })),
		),
		customPriorities: v.optional(
			v.array(v.object({ key: v.string(), name: v.string(), color: v.string() })),
		),
	}).index("by_workspace", ["workspaceId"]),

	workspacePresence: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		lastActiveAt: v.number(),
	})
		.index("by_workspace_user", ["workspaceId", "userId"])
		.index("by_workspace", ["workspaceId"]),

	inviteCodes: defineTable({
		code: v.string(),
		workspaceId: v.id("workspaces"),
		createdBy: v.id("users"),
		expiresAt: v.optional(v.number()),
		maxUses: v.optional(v.number()),
		useCount: v.number(),
		usedBy: v.optional(v.array(v.id("users"))),
	})
		.index("by_code", ["code"])
		.index("by_workspace", ["workspaceId"]),

	// ── Projects ──────────────────────────────────────────────────────────────

	projects: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		summary: v.optional(v.string()),
		richDescription: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		status: v.string(),
		priority: v.optional(v.string()),
		leadId: v.optional(v.id("users")),
		clientId: v.optional(v.id("clients")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		intent: v.optional(v.string()),
		successType: v.optional(v.string()),
		structure: v.optional(v.string()),
		scopeInItems: v.optional(v.array(v.string())),
		scopeOutItems: v.optional(v.array(v.string())),
		outcomes: v.optional(v.array(v.string())),
		resources: v.optional(
			v.array(v.object({ url: v.string(), label: v.string() })),
		),
		typeLabel: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		sortOrder: v.number(),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_workspace_sort", ["workspaceId", "sortOrder"])
		.index("by_workspace_status", ["workspaceId", "status"])
		.index("by_workspace_slug", ["workspaceId", "slug"])
		.index("by_client", ["clientId"])
		.index("by_workspace", ["workspaceId"])
		.searchIndex("search_name", {
			searchField: "name",
			filterFields: ["workspaceId"],
		}),

	projectMembers: defineTable({
		projectId: v.id("projects"),
		userId: v.id("users"),
		role: v.string(),
		addedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_project_user", ["projectId", "userId"])
		.index("by_user", ["userId"]),

	projectUpdates: defineTable({
		projectId: v.id("projects"),
		health: v.optional(v.string()),
		body: v.string(),
		createdBy: v.id("users"),
	}).index("by_project", ["projectId"]),

	// ── Issues ────────────────────────────────────────────────────────────────

	issues: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		milestoneId: v.optional(v.id("milestones")),
		parentId: v.optional(v.id("issues")),
		identifier: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		priority: v.string(),
		type: v.string(),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		sortOrder: v.number(),
		estimate: v.optional(v.number()),
		tags: v.optional(v.array(v.string())),
		createdBy: v.id("users"),
		completedAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		gitBranchName: v.optional(v.string()),
		linkedDocumentIds: v.optional(v.array(v.id("documents"))),
		linkedWhiteboardIds: v.optional(v.array(v.id("whiteboards"))),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_milestone_sort", ["milestoneId", "sortOrder"])
		.index("by_workspace_assignee", ["workspaceId", "assigneeId"])
		.index("by_identifier", ["workspaceId", "identifier"])
		.index("by_parent", ["parentId"])
		.index("by_project", ["projectId"])
		.index("by_milestone", ["milestoneId"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),

	issueRelations: defineTable({
		issueId: v.id("issues"),
		relatedIssueId: v.id("issues"),
		type: v.string(),
		createdBy: v.id("users"),
		createdAt: v.number(),
	})
		.index("by_issue", ["issueId"])
		.index("by_related_issue", ["relatedIssueId"])
		.index("by_issue_type", ["issueId", "type"]),

	issueSubscriptions: defineTable({
		issueId: v.id("issues"),
		userId: v.id("users"),
		createdAt: v.optional(v.number()),
	})
		.index("by_issue", ["issueId"])
		.index("by_issue_user", ["issueId", "userId"])
		.index("by_user", ["userId"]),

	milestones: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
		sortOrder: v.number(),
		status: v.string(),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_project", ["projectId"]),

	sprints: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		sortOrder: v.number(),
		goals: v.optional(v.array(v.string())),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_project", ["projectId"]),

	stories: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		sprintId: v.optional(v.id("sprints")),
		parentId: v.optional(v.id("stories")),
		identifier: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		priority: v.string(),
		type: v.string(),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		sortOrder: v.number(),
		estimate: v.optional(v.number()),
		tags: v.optional(v.array(v.string())),
		createdBy: v.id("users"),
		completedAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_sprint_sort", ["sprintId", "sortOrder"])
		.index("by_workspace_assignee", ["workspaceId", "assigneeId"])
		.index("by_identifier", ["workspaceId", "identifier"])
		.index("by_parent", ["parentId"])
		.index("by_project_status", ["projectId", "status"])
		.index("by_sprint", ["sprintId"])
		.index("by_workspace", ["workspaceId"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),

	tasks: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		storyId: v.optional(v.id("stories")),
		sprintId: v.optional(v.id("sprints")),
		parentId: v.optional(v.id("tasks")),
		identifier: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		priority: v.string(),
		type: v.string(),
		assigneeId: v.optional(v.id("users")),
		labelIds: v.optional(v.array(v.id("labels"))),
		startDate: v.optional(v.number()),
		dueDate: v.optional(v.number()),
		sortOrder: v.number(),
		estimate: v.optional(v.number()),
		tags: v.optional(v.array(v.string())),
		createdBy: v.id("users"),
		completedAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_story", ["storyId"])
		.index("by_sprint", ["sprintId"])
		.index("by_workspace_assignee", ["workspaceId", "assigneeId"])
		.index("by_identifier", ["workspaceId", "identifier"])
		.index("by_parent", ["parentId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_project_status", ["projectId", "status"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),

	labels: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		color: v.string(),
		description: v.optional(v.string()),
		sortOrder: v.optional(v.number()),
		createdBy: v.optional(v.id("users")),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	}).index("by_workspace", ["workspaceId"]),

	// ── Documents ─────────────────────────────────────────────────────────────

	documents: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		icon: v.optional(v.string()),
		content: v.optional(v.string()),
		coverStorageId: v.optional(v.id("_storage")),
		sortOrder: v.optional(v.number()),
		createdBy: v.id("users"),
		lastEditedBy: v.optional(v.id("users")),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		isPinned: v.optional(v.boolean()),
		visibility: v.optional(v.string()),
		shareToken: v.optional(v.string()),
		defaultPermission: v.optional(v.string()),
	})
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_share_token", ["shareToken"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),

	documentShares: defineTable({
		documentId: v.id("documents"),
		userId: v.id("users"),
		permission: v.string(),
		sharedBy: v.optional(v.id("users")),
		sharedAt: v.optional(v.number()),
		grantedBy: v.optional(v.id("users")),
		grantedAt: v.optional(v.number()),
	})
		.index("by_document", ["documentId"])
		.index("by_document_user", ["documentId", "userId"]),

	documentPresence: defineTable({
		documentId: v.id("documents"),
		userId: v.id("users"),
		cursorFrom: v.optional(v.number()),
		cursorTo: v.optional(v.number()),
		lastActiveAt: v.number(),
	})
		.index("by_document_user", ["documentId", "userId"])
		.index("by_document", ["documentId"]),

	documentThreads: defineTable({
		documentId: v.id("documents"),
		workspaceId: v.id("workspaces"),
		createdBy: v.id("users"),
		resolved: v.boolean(),
		metadata: v.optional(v.string()),
		deletedAt: v.optional(v.number()),
		resolvedBy: v.optional(v.id("users")),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_document", ["documentId"])
		.index("by_workspace", ["workspaceId"]),

	documentComments: defineTable({
		threadId: v.id("documentThreads"),
		documentId: v.id("documents"),
		workspaceId: v.id("workspaces"),
		authorId: v.id("users"),
		body: v.string(),
		metadata: v.optional(v.string()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_thread", ["threadId"])
		.index("by_document", ["documentId"]),

	documentCommentReactions: defineTable({
		commentId: v.id("documentComments"),
		threadId: v.id("documentThreads"),
		userId: v.id("users"),
		emoji: v.string(),
	})
		.index("by_thread", ["threadId"])
		.index("by_comment", ["commentId"]),

	// ── Whiteboards ───────────────────────────────────────────────────────────

	whiteboards: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		sceneData: v.optional(v.string()),
		appState: v.optional(v.string()),
		sortOrder: v.optional(v.number()),
		createdBy: v.id("users"),
		lastEditedBy: v.optional(v.id("users")),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		thumbnailStorageId: v.optional(v.id("_storage")),
		isPinned: v.optional(v.boolean()),
		visibility: v.optional(v.string()),
		shareToken: v.optional(v.string()),
		defaultPermission: v.optional(v.string()),
	})
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_share_token", ["shareToken"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),

	whiteboardShares: defineTable({
		whiteboardId: v.id("whiteboards"),
		userId: v.id("users"),
		permission: v.string(),
		sharedBy: v.optional(v.id("users")),
		sharedAt: v.optional(v.number()),
		grantedBy: v.optional(v.id("users")),
		grantedAt: v.optional(v.number()),
	})
		.index("by_whiteboard", ["whiteboardId"])
		.index("by_whiteboard_user", ["whiteboardId", "userId"]),

	whiteboardPresence: defineTable({
		whiteboardId: v.id("whiteboards"),
		userId: v.id("users"),
		cursorX: v.optional(v.number()),
		cursorY: v.optional(v.number()),
		lastActiveAt: v.number(),
	})
		.index("by_whiteboard_user", ["whiteboardId", "userId"])
		.index("by_whiteboard", ["whiteboardId"]),

	// ── Comments ──────────────────────────────────────────────────────────────

	comments: defineTable({
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		whiteboardId: v.optional(v.id("whiteboards")),
		parentId: v.optional(v.id("comments")),
		body: v.string(),
		authorId: v.id("users"),
		attachmentIds: v.optional(v.array(v.id("files"))),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		canvasX: v.optional(v.number()),
		canvasY: v.optional(v.number()),
		elementId: v.optional(v.string()),
		resolved: v.optional(v.boolean()),
		resolvedBy: v.optional(v.id("users")),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_issue", ["issueId"])
		.index("by_task", ["taskId"])
		.index("by_story", ["storyId"])
		.index("by_whiteboard", ["whiteboardId"]),

	// ── Notifications ─────────────────────────────────────────────────────────

	notifications: defineTable({
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		type: v.string(),
		title: v.string(),
		body: v.optional(v.string()),
		preview: v.optional(v.string()),
		isRead: v.boolean(),
		readAt: v.optional(v.number()),
		isArchived: v.optional(v.boolean()),
		deletedAt: v.optional(v.number()),
		snoozedUntil: v.optional(v.number()),
		actorId: v.optional(v.id("users")),
		projectId: v.optional(v.id("projects")),
		clientId: v.optional(v.id("clients")),
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		documentId: v.optional(v.id("documents")),
		whiteboardId: v.optional(v.id("whiteboards")),
		commentId: v.optional(v.id("comments")),
	})
		.index("by_user_workspace_unread", ["userId", "workspaceId", "isRead"])
		.index("by_user_workspace", ["userId", "workspaceId"]),

	// ── Activity & Favorites ──────────────────────────────────────────────────

	favorites: defineTable({
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		entityType: v.string(),
		entityId: v.string(),
		sortOrder: v.optional(v.number()),
	})
		.index("by_user_workspace", ["userId", "workspaceId"])
		.index("by_user_entity", ["userId", "entityType", "entityId"]),

	activityLogs: defineTable({
		workspaceId: v.id("workspaces"),
		entityType: v.string(),
		entityId: v.string(),
		action: v.string(),
		actorId: v.id("users"),
		description: v.optional(v.string()),
		issueId: v.optional(v.id("issues")),
		projectId: v.optional(v.id("projects")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		clientId: v.optional(v.id("clients")),
		documentId: v.optional(v.id("documents")),
		whiteboardId: v.optional(v.id("whiteboards")),
		field: v.optional(v.string()),
		oldValue: v.optional(v.string()),
		newValue: v.optional(v.string()),
		metadata: v.optional(v.string()),
	})
		.index("by_issue", ["issueId"])
		.index("by_task", ["taskId"])
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"]),

	// ── Files ─────────────────────────────────────────────────────────────────

	files: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		issueId: v.optional(v.id("issues")),
		storyId: v.optional(v.id("stories")),
		noteId: v.optional(v.id("notes")),
		name: v.string(),
		description: v.optional(v.string()),
		storageId: v.optional(v.id("_storage")),
		externalUrl: v.optional(v.string()),
		mimeType: v.optional(v.string()),
		size: v.optional(v.number()),
		fileType: v.optional(v.string()),
		uploadedBy: v.id("users"),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_story", ["storyId"])
		.index("by_issue", ["issueId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_note", ["noteId"]),

	// ── Clients ───────────────────────────────────────────────────────────────

	clients: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		status: v.string(),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		location: v.optional(v.string()),
		segment: v.optional(v.string()),
		ownerId: v.optional(v.id("users")),
		notes: v.optional(v.string()),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		logoStorageId: v.optional(v.id("_storage")),
	})
		.index("by_workspace_status", ["workspaceId", "status"])
		.index("by_workspace", ["workspaceId"])
		.searchIndex("search_name", {
			searchField: "name",
			filterFields: ["workspaceId"],
		}),

	clientContacts: defineTable({
		clientId: v.id("clients"),
		name: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		role: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
		createdBy: v.optional(v.id("users")),
	}).index("by_client", ["clientId"]),

	// ── Notes ─────────────────────────────────────────────────────────────────

	notes: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		content: v.optional(v.string()),
		noteType: v.optional(v.string()),
		labelIds: v.optional(v.array(v.id("labels"))),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"])
		.searchIndex("search_title", {
			searchField: "title",
			filterFields: ["workspaceId"],
		}),
});
