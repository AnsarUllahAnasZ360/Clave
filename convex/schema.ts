import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const slashCommandValidator = v.object({
	id: v.string(),
	command: v.string(),
	title: v.string(),
	description: v.string(),
	content: v.string(),
	isShortcut: v.boolean(),
	createdAt: v.number(),
	updatedAt: v.number(),
	createdBy: v.optional(v.id("users")),
});

export default defineSchema({
	...authTables,

	// ── Core ──────────────────────────────────────────────────────────────────

	users: defineTable({
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		image: v.optional(v.string()),
		// Fields required by @convex-dev/auth
		emailVerificationTime: v.optional(v.number()),
		phone: v.optional(v.string()),
		phoneVerificationTime: v.optional(v.number()),
		isAnonymous: v.optional(v.boolean()),
		// App-specific fields
		avatarStorageId: v.optional(v.id("_storage")),
		role: v.optional(v.string()),
		timezone: v.optional(v.string()),
		theme: v.optional(
			v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
		),
		locale: v.optional(v.string()),
		sidebarCollapsed: v.optional(v.boolean()),
		compactMode: v.optional(v.boolean()),
		sidebarSections: v.optional(
			v.object({
				recents: v.optional(v.boolean()),
				favorites: v.optional(v.boolean()),
				projects: v.optional(v.boolean()),
			}),
		),
		notifyEmail: v.optional(v.boolean()),
		notifyPush: v.optional(v.boolean()),
		notifyInApp: v.optional(v.boolean()),
		notifyGoogleChat: v.optional(v.boolean()),
		aiAboutMe: v.optional(v.string()),
		aiHowToWorkWithMe: v.optional(v.string()),
		personalSlashCommands: v.optional(v.array(slashCommandValidator)),
		lastSeenVersion: v.optional(v.string()),
		lastActiveWorkspaceId: v.optional(v.id("workspaces")),
		lastActiveContextAt: v.optional(v.number()),
		// Kept for backward compat — migration clears this field
		lastActiveOrganizationId: v.optional(v.string()),
		suspended: v.optional(v.boolean()),
		// Demo workspace fields
		isDemoUser: v.optional(v.boolean()),
		demoOnboardingDismissed: v.optional(v.boolean()),
		// Account lifecycle
		deletedAt: v.optional(v.number()),
	})
		.index("email", ["email"])
		.index("phone", ["phone"]),

	// ── Legacy org tables (empty after migration — safe to remove once confirmed) ─

	organizations: defineTable({
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
		ownerId: v.optional(v.id("users")),
		plan: v.optional(v.string()),
		planLimits: v.optional(
			v.object({
				maxMembers: v.optional(v.number()),
				maxWorkspaces: v.optional(v.number()),
			}),
		),
		stripeCustomerId: v.optional(v.string()),
		subscriptionId: v.optional(v.string()),
		subscriptionStatus: v.optional(v.string()),
		trialEndsAt: v.optional(v.number()),
		billingEmail: v.optional(v.string()),
		suspended: v.optional(v.boolean()),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	}).index("by_slug", ["slug"]),

	organizationMembers: defineTable({
		organizationId: v.optional(v.string()),
		userId: v.optional(v.id("users")),
		role: v.optional(v.string()),
		joinedAt: v.optional(v.number()),
		invitedBy: v.optional(v.id("users")),
	})
		.index("by_org", ["organizationId"])
		.index("by_org_user", ["organizationId", "userId"])
		.index("by_user", ["userId"]),

	organizationInviteCodes: defineTable({
		organizationId: v.optional(v.string()),
		code: v.optional(v.string()),
		createdBy: v.optional(v.id("users")),
		expiresAt: v.optional(v.number()),
		maxUses: v.optional(v.number()),
		useCount: v.optional(v.number()),
		usedBy: v.optional(v.array(v.id("users"))),
		role: v.optional(v.string()),
	})
		.index("by_code", ["code"])
		.index("by_org", ["organizationId"]),

	// ── Workspaces ────────────────────────────────────────────────────────────

	workspaces: defineTable({
		name: v.string(),
		slug: v.string(),
		ownerId: v.id("users"),
		// Kept for backward compat — migration clears these fields
		organizationId: v.optional(v.string()),
		visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
		// Billing
		plan: v.optional(
			v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
		),
		planLimits: v.optional(
			v.object({
				maxMembers: v.optional(v.number()),
			}),
		),
		stripeCustomerId: v.optional(v.string()),
		subscriptionId: v.optional(v.string()),
		subscriptionStatus: v.optional(v.string()),
		trialEndsAt: v.optional(v.number()),
		billingEmail: v.optional(v.string()),
		suspended: v.optional(v.boolean()),
		// Demo workspace fields
		isDemo: v.optional(v.boolean()),
		demoExpiresAt: v.optional(v.number()),
		demoSeedStatus: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("seeding"),
				v.literal("complete"),
				v.literal("failed"),
			),
		),
		createdAt: v.optional(v.number()),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_owner", ["ownerId"])
		.index("by_slug", ["slug"])
		.index("by_stripe_customer", ["stripeCustomerId"])
		.index("by_demo_expires", ["isDemo", "demoExpiresAt"]),

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
		aiWorkspaceContext: v.optional(v.string()),
		aiAssistantCharacteristics: v.optional(v.string()),
		workspaceSlashCommands: v.optional(v.array(slashCommandValidator)),
		customTypes: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
		customStatuses: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
		// Persisted display order for the merged status list (defaults + customs).
		// When set, the effective status list is sorted by this key ordering;
		// keys not in the array fall back to their natural order at the end.
		customStatusOrder: v.optional(v.array(v.string())),
		customPriorities: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
	}).index("by_workspace", ["workspaceId"]),

	workspacePresence: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		lastActiveAt: v.number(),
	})
		.index("by_workspace_user", ["workspaceId", "userId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_user", ["userId"]),

	inviteCodes: defineTable({
		code: v.string(),
		workspaceId: v.id("workspaces"),
		createdBy: v.id("users"),
		role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
		expiresAt: v.optional(v.number()),
		maxUses: v.optional(v.number()),
		useCount: v.number(),
		usedBy: v.optional(v.array(v.id("users"))),
		status: v.optional(
			v.union(
				v.literal("pending"),
				v.literal("accepted"),
				v.literal("expired"),
				v.literal("rejected"),
			),
		),
		acceptedBy: v.optional(v.id("users")),
		acceptedAt: v.optional(v.number()),
		sentTo: v.optional(v.string()), // Email the invite was sent to (for email invites)
	})
		.index("by_code", ["code"])
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_status", ["workspaceId", "status"]),

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
		// Project-level overrides (if set, these override workspace defaults)
		customStatuses: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
		// Persisted display order for the merged status list at this project's
		// scope (overrides workspace ordering when set).
		customStatusOrder: v.optional(v.array(v.string())),
		customTypes: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
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
		sprintId: v.optional(v.id("sprints")),
		listId: v.optional(v.id("lists")),
		milestoneId: v.optional(v.id("milestones")),
		parentId: v.optional(v.id("issues")),
		identifier: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		priority: v.string(),
		type: v.string(),
		assigneeId: v.optional(v.id("users")),
		assigneeIds: v.optional(v.array(v.id("users"))),
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
		githubSyncSource: v.optional(
			v.union(v.literal("github"), v.literal("clave")),
		),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_status", ["workspaceId", "status"])
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_sprint_sort", ["sprintId", "sortOrder"])
		.index("by_list_sort", ["listId", "sortOrder"])
		.index("by_milestone_sort", ["milestoneId", "sortOrder"])
		.index("by_workspace_assignee", ["workspaceId", "assigneeId"])
		.index("by_identifier", ["workspaceId", "identifier"])
		.index("by_parent", ["parentId"])
		.index("by_project", ["projectId"])
		.index("by_sprint", ["sprintId"])
		.index("by_list", ["listId"])
		.index("by_milestone", ["milestoneId"])
		.index("by_workspace_creator", ["workspaceId", "createdBy"])
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
		.index("by_issue_type", ["issueId", "type"])
		.index("by_type", ["type"]),

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

	sprintFolders: defineTable({
		projectId: v.id("projects"),
		name: v.string(),
		icon: v.optional(v.string()),
		sortOrder: v.number(),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_project", ["projectId"]),

	sprints: defineTable({
		projectId: v.id("projects"),
		folderId: v.optional(v.id("sprintFolders")),
		name: v.string(),
		description: v.optional(v.string()),
		status: v.string(),
		// Set to true when a user manually picks a status in the UI. The
		// scheduling cron that flips planned → active → completed based on
		// startDate/endDate skips sprints with this flag so manual intent
		// wins (e.g. marking "cancelled" or closing a sprint early).
		statusOverride: v.optional(v.boolean()),
		icon: v.optional(v.string()),
		startDate: v.optional(v.number()),
		targetDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		sortOrder: v.number(),
		goals: v.optional(v.array(v.string())),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_project", ["projectId"])
		.index("by_folder", ["folderId"]),

	lists: defineTable({
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		sortOrder: v.number(),
		createdBy: v.id("users"),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	})
		.index("by_project_sort", ["projectId", "sortOrder"])
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"]),

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
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_name", ["workspaceId", "name"]),

	// ── Documents ─────────────────────────────────────────────────────────────

	documents: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		icon: v.optional(v.string()),
		content: v.optional(v.string()),
		coverStorageId: v.optional(v.id("_storage")),
		coverPositionY: v.optional(v.number()),
		sortOrder: v.optional(v.number()),
		createdBy: v.id("users"),
		lastEditedBy: v.optional(v.id("users")),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
		isPinned: v.optional(v.boolean()),
		visibility: v.optional(v.string()),
		shareToken: v.optional(v.string()),
		defaultPermission: v.optional(v.string()),
		syncVersion: v.optional(v.string()),
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
		icon: v.optional(v.string()),
		sceneData: v.optional(v.string()),
		/** Full scene JSON in file storage when inline sceneData would exceed the 1 MiB doc limit */
		sceneDataStorageId: v.optional(v.id("_storage")),
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

	// Persisted copies of embedded Excalidraw image files. Populated after
	// every scene update so the AI layer (RAG, descriptions, OCR) has stable
	// storageId-backed references instead of parsing base64 out of sceneData.
	whiteboardImages: defineTable({
		whiteboardId: v.id("whiteboards"),
		workspaceId: v.id("workspaces"),
		/** Excalidraw `files` map key — also referenced by image elements via `fileId`. */
		fileKey: v.string(),
		storageId: v.id("_storage"),
		mediaType: v.string(),
		byteSize: v.number(),
		/** SHA-256 of the raw binary for dedupe/change detection. */
		sha256: v.string(),
		/** Optional OCR text (Phase 3 indexer populates). */
		ocrText: v.optional(v.string()),
		/** Optional AI-generated caption (Phase 3). */
		caption: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_whiteboard", ["whiteboardId"])
		.index("by_whiteboard_filekey", ["whiteboardId", "fileKey"])
		.index("by_workspace", ["workspaceId"]),

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
		.index("by_whiteboard", ["whiteboardId"])
		.index("by_parent", ["parentId"])
		.index("by_author", ["authorId"]),

	// ── Notifications ─────────────────────────────────────────────────────────

	notifications: defineTable({
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		type: v.string(),
		eventType: v.optional(v.string()),
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
		dedupeKey: v.optional(v.string()),
		reason: v.optional(v.string()),
		eventAt: v.optional(v.number()),
		source: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
	})
		.index("by_user_workspace_unread", ["userId", "workspaceId", "isRead"])
		.index("by_user_workspace", ["userId", "workspaceId"])
		.index("by_user_workspace_dedupe", ["userId", "workspaceId", "dedupeKey"])
		.index("by_user_workspace_snoozed_until", [
			"userId",
			"workspaceId",
			"snoozedUntil",
		])
		.index("by_snoozed_until", ["snoozedUntil"]),

	// ── Recents ──────────────────────────────────────────────────────────────

	recents: defineTable({
		userId: v.id("users"),
		workspaceId: v.id("workspaces"),
		entityType: v.string(),
		entityId: v.string(),
		accessedAt: v.number(),
	})
		.index("by_user_workspace", ["userId", "workspaceId", "accessedAt"])
		.index("by_user_entity", ["userId", "entityId"]),

	// ── Bug Reports ─────────────────────────────────────────────────────────

	bugReports: defineTable({
		userId: v.id("users"),
		title: v.string(),
		description: v.string(),
		steps: v.optional(v.string()),
		severity: v.optional(v.string()),
		issueUrl: v.optional(v.string()),
		issueNumber: v.optional(v.number()),
		status: v.union(v.literal("created"), v.literal("failed")),
	}).index("by_user", ["userId"]),

	// ── App Versions ────────────────────────────────────────────────────────

	appVersions: defineTable({
		version: v.string(),
		releasedAt: v.number(),
		title: v.string(),
		features: v.array(v.string()),
		bugFixes: v.array(v.string()),
	}).index("by_released", ["releasedAt"]),

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
		.index("by_workspace", ["workspaceId"])
		.index("by_story", ["storyId"]),

	// ── Files ─────────────────────────────────────────────────────────────────

	files: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		issueId: v.optional(v.id("issues")),
		storyId: v.optional(v.id("stories")),
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
		.index("by_workspace", ["workspaceId"]),

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

	// ── AI ───────────────────────────────────────────────────────────────────

	aiTeammates: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		avatar: v.optional(v.string()),
		description: v.optional(v.string()),
		systemPrompt: v.string(),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		temperature: v.optional(v.number()),
		isDefault: v.boolean(),
		createdBy: v.id("users"),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_default", ["workspaceId", "isDefault"]),

	subAgents: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.string(),
		avatar: v.optional(v.string()),
		instructions: v.string(),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		ragContentTypes: v.optional(
			v.array(
				v.union(
					v.literal("issue"),
					v.literal("document"),
					v.literal("comment"),
					v.literal("github_file"),
				),
			),
		),
		isShared: v.boolean(),
		isPreset: v.boolean(),
		createdBy: v.id("users"),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_creator", ["createdBy"])
		.index("by_workspace_shared", ["workspaceId", "isShared"]),

	skills: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.string(),
		category: v.string(),
		markdownContent: v.string(),
		isEnabled: v.boolean(),
		createdBy: v.id("users"),
		updatedAt: v.number(),
		sourceProvider: v.optional(v.string()),
		sourceRepo: v.optional(v.string()),
		sourceSkillId: v.optional(v.string()),
		sourceUrl: v.optional(v.string()),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_name", ["workspaceId", "name"])
		.index("by_workspace_enabled", ["workspaceId", "isEnabled"])
		.index("by_creator", ["createdBy"]),

	agentSkills: defineTable({
		subAgentId: v.id("subAgents"),
		skillId: v.id("skills"),
	})
		.index("by_agent", ["subAgentId"])
		.index("by_skill", ["skillId"]),

	aiThreads: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		threadId: v.string(),
		title: v.optional(v.string()),
		model: v.optional(v.string()),
		aiTeammateId: v.optional(v.id("aiTeammates")),
		selectedMcpServerIds: v.optional(v.array(v.id("mcpServers"))),
		isIncognito: v.optional(v.boolean()),
		updatedAt: v.number(),
	})
		.index("by_workspace_user", ["workspaceId", "userId"])
		.index("by_thread_id", ["threadId"]),

	aiToolApprovals: defineTable({
		threadId: v.string(),
		toolCallId: v.string(),
		toolName: v.string(),
		description: v.string(),
		actionPayload: v.string(),
		status: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("rejected"),
		),
		resultMessage: v.optional(v.string()),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_thread", ["threadId"])
		.index("by_toolCallId", ["toolCallId"]),

	audioRecordings: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		storageId: v.optional(v.id("_storage")),
		mimeType: v.string(),
		duration: v.optional(v.number()),
		fileSize: v.optional(v.number()),
		status: v.union(
			v.literal("uploading"),
			v.literal("ready"),
			v.literal("transcribing"),
			v.literal("transcribed"),
			v.literal("failed"),
		),
		transcript: v.optional(v.string()),
		transcriptFormat: v.optional(v.string()),
		transcriptLanguage: v.optional(v.string()),
		transcriptDurationSeconds: v.optional(v.number()),
		transcriptSegmentsJson: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		retryCount: v.number(),
		createdAt: v.number(),
		audioCleanedAt: v.optional(v.number()),
	})
		.index("by_workspace_user", ["workspaceId", "userId"])
		.index("by_created_at", ["createdAt"])
		.index("by_user", ["userId"]),

	// ── AI Audit Log ─────────────────────────────────────────────────────────

	aiAuditLog: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		subAgentId: v.optional(v.id("subAgents")),
		action: v.string(),
		details: v.optional(v.string()),
		threadId: v.optional(v.string()),
		workflowId: v.optional(v.string()),
		timestamp: v.number(),
	})
		.index("by_workspace", ["workspaceId", "timestamp"])
		.index("by_user", ["userId", "timestamp"]),

	// ── Workflows ────────────────────────────────────────────────────────────

	workflowRuns: defineTable({
		workspaceId: v.id("workspaces"),
		workflowId: v.string(),
		threadId: v.optional(v.string()),
		subAgentId: v.optional(v.id("subAgents")),
		userId: v.id("users"),
		taskDescription: v.string(),
		status: v.union(
			v.literal("running"),
			v.literal("paused"),
			v.literal("completed"),
			v.literal("failed"),
			v.literal("cancelled"),
		),
		progress: v.optional(
			v.array(
				v.object({
					step: v.string(),
					status: v.union(
						v.literal("running"),
						v.literal("done"),
						v.literal("failed"),
					),
					timestamp: v.number(),
				}),
			),
		),
		pausePrompt: v.optional(v.string()),
		pauseOptions: v.optional(v.array(v.string())),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_status", ["workspaceId", "status"])
		.index("by_user", ["userId"])
		.index("by_thread", ["threadId"]),

	// ── MCP Servers ─────────────────────────────────────────────────────────

	mcpServers: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.optional(v.string()),
		url: v.string(),
		transport: v.optional(v.union(v.literal("http"), v.literal("sse"))),
		authType: v.optional(
			v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
		),
		authConfigUrl: v.optional(v.string()),
		apiKey: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		status: v.union(v.literal("active"), v.literal("inactive")),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
		deletedAt: v.optional(v.number()),
	}).index("by_workspace", ["workspaceId"]),

	// ── RAG Pipeline ────────────────────────────────────────────────────────

	ragSyncStatus: defineTable({
		projectId: v.id("projects"),
		sourceType: v.union(
			v.literal("issue"),
			v.literal("document"),
			v.literal("note"),
			v.literal("comment"),
			v.literal("github_file"),
			v.literal("doc_page"),
			v.literal("whiteboard"),
		),
		sourceId: v.string(),
		contentHash: v.string(),
		lastSyncedAt: v.number(),
		chunkCount: v.number(),
		status: v.union(
			v.literal("synced"),
			v.literal("pending"),
			v.literal("error"),
		),
		errorMessage: v.optional(v.string()),
		ragEntryId: v.optional(v.string()),
	})
		.index("by_project_source", ["projectId", "sourceType", "sourceId"])
		.index("by_status", ["status"])
		.index("by_project", ["projectId"]),

	/** Sync tracking for global doc pages (not project-scoped) */
	docPageSyncStatus: defineTable({
		slug: v.string(),
		contentHash: v.string(),
		lastSyncedAt: v.number(),
		chunkCount: v.number(),
		status: v.union(
			v.literal("synced"),
			v.literal("pending"),
			v.literal("error"),
		),
		errorMessage: v.optional(v.string()),
		ragEntryId: v.optional(v.string()),
	})
		.index("by_slug", ["slug"])
		.index("by_status", ["status"]),

	ragBackfillJobs: defineTable({
		projectId: v.id("projects"),
		status: v.union(
			v.literal("running"),
			v.literal("completed"),
			v.literal("failed"),
		),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		startedBy: v.id("users"),
		issuesTotal: v.optional(v.number()),
		issuesIndexed: v.optional(v.number()),
		documentsTotal: v.optional(v.number()),
		documentsIndexed: v.optional(v.number()),
		notesTotal: v.optional(v.number()),
		notesIndexed: v.optional(v.number()),
		commentsTotal: v.optional(v.number()),
		commentsIndexed: v.optional(v.number()),
		completedPhases: v.optional(v.array(v.string())),
		error: v.optional(v.string()),
	}).index("by_project", ["projectId"]),

	// ── Chat Integrations ───────────────────────────────────────────────────

	chatConnections: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		status: v.union(
			v.literal("connected"),
			v.literal("disconnected"),
			v.literal("error"),
		),
		webhookUrl: v.optional(v.string()),
		authAudience: v.optional(v.string()),
		externalAppId: v.optional(v.string()),
		externalAppName: v.optional(v.string()),
		installedBy: v.id("users"),
		installedAt: v.number(),
		disconnectedAt: v.optional(v.number()),
		lastHealthcheckAt: v.optional(v.number()),
		lastHealthcheckStatus: v.optional(
			v.union(v.literal("ok"), v.literal("error"), v.literal("unknown")),
		),
		lastHealthcheckMessage: v.optional(v.string()),
		lastWebhookEventAt: v.optional(v.number()),
		lastWebhookEventId: v.optional(v.string()),
		marketplaceInstallId: v.optional(v.string()),
		marketplaceInstalledAt: v.optional(v.number()),
		marketplaceProjectNumber: v.optional(v.string()),
		encryptedCredentials: v.optional(v.string()),
		byosaClientEmail: v.optional(v.string()),
		credentialSource: v.optional(
			v.union(
				v.literal("marketplace"),
				v.literal("byosa"),
				v.literal("global"),
			),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_provider", ["workspaceId", "provider"])
		.index("by_provider_status", ["provider", "status"])
		.index("by_byosa_client_email", ["byosaClientEmail"]),

	chatVerificationCodes: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		code: v.string(),
		expiresAt: v.number(),
		status: v.union(
			v.literal("pending"),
			v.literal("consumed"),
			v.literal("expired"),
		),
		consumedByChatUserId: v.optional(v.string()),
		consumedAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_code", ["code"])
		.index("by_workspace_user", ["workspaceId", "userId"]),

	chatUserLinks: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		chatUserId: v.string(),
		chatDisplayName: v.optional(v.string()),
		chatEmail: v.optional(v.string()),
		userId: v.id("users"),
		linkedBy: v.id("users"),
		linkedAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_user", ["userId"])
		.index("by_workspace_provider_chat_user_id", [
			"workspaceId",
			"provider",
			"chatUserId",
		])
		.index("by_workspace_provider_user_id", [
			"workspaceId",
			"provider",
			"userId",
		]),

	chatConversations: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		spaceName: v.string(),
		conversationKey: v.string(),
		chatThreadName: v.optional(v.string()),
		chatMessageName: v.optional(v.string()),
		chatUserId: v.optional(v.string()),
		aiThreadId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
		lastMessageAt: v.optional(v.number()),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_provider_conversation_key", [
			"workspaceId",
			"provider",
			"conversationKey",
		])
		.index("by_workspace_provider_ai_thread", [
			"workspaceId",
			"provider",
			"aiThreadId",
		])
		.index("by_workspace_provider_space_name", [
			"workspaceId",
			"provider",
			"spaceName",
		]),

	chatSubscriptions: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		targetType: v.union(v.literal("dm"), v.literal("space")),
		targetId: v.string(),
		eventType: v.string(),
		enabled: v.boolean(),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_provider_target", [
			"workspaceId",
			"provider",
			"targetType",
			"targetId",
		])
		.index("by_workspace_provider_event_type", [
			"workspaceId",
			"provider",
			"eventType",
		])
		.index("by_workspace_provider_target_event_type", [
			"workspaceId",
			"provider",
			"targetType",
			"targetId",
			"eventType",
		]),

	chatDeliveryLogs: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		targetType: v.union(v.literal("dm"), v.literal("space")),
		targetId: v.string(),
		eventType: v.string(),
		status: v.union(
			v.literal("queued"),
			v.literal("sent"),
			v.literal("failed"),
			v.literal("dropped"),
		),
		idempotencyKey: v.string(),
		notificationId: v.optional(v.id("notifications")),
		attemptCount: v.number(),
		maxAttempts: v.number(),
		lastAttemptAt: v.optional(v.number()),
		nextAttemptAt: v.optional(v.number()),
		errorMessage: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		providerMessageName: v.optional(v.string()),
		providerThreadName: v.optional(v.string()),
		deliveredAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_provider_status", [
			"workspaceId",
			"provider",
			"status",
		])
		.index("by_workspace_provider_notification", [
			"workspaceId",
			"provider",
			"notificationId",
		])
		.index("by_workspace_provider_status_next_attempt_at", [
			"workspaceId",
			"provider",
			"status",
			"nextAttemptAt",
		])
		.index("by_workspace_provider_idempotency_key", [
			"workspaceId",
			"provider",
			"idempotencyKey",
		])
		.index("by_workspace_provider_created_at", [
			"workspaceId",
			"provider",
			"createdAt",
		]),

	chatDeliveryDeadLetters: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		deliveryLogId: v.optional(v.id("chatDeliveryLogs")),
		notificationId: v.optional(v.id("notifications")),
		targetType: v.union(v.literal("dm"), v.literal("space")),
		targetId: v.string(),
		eventType: v.string(),
		idempotencyKey: v.string(),
		attemptCount: v.number(),
		maxAttempts: v.number(),
		reason: v.string(),
		errorCode: v.optional(v.string()),
		lastAttemptAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace_provider_created_at", [
			"workspaceId",
			"provider",
			"createdAt",
		])
		.index("by_workspace_provider_idempotency_key", [
			"workspaceId",
			"provider",
			"idempotencyKey",
		]),

	chatDeliveryHealthSnapshots: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		status: v.union(
			v.literal("healthy"),
			v.literal("degraded"),
			v.literal("open_circuit"),
			v.literal("throttled"),
		),
		consecutiveFailures: v.number(),
		circuitOpenedAt: v.optional(v.number()),
		circuitOpenUntil: v.optional(v.number()),
		throttleUntil: v.optional(v.number()),
		rateWindowStartedAt: v.number(),
		rateWindowCount: v.number(),
		totalSent: v.number(),
		totalFailed: v.number(),
		totalDropped: v.number(),
		totalDeadLettered: v.number(),
		totalRetried: v.number(),
		lastDeliveryAt: v.optional(v.number()),
		lastFailureAt: v.optional(v.number()),
		lastErrorCode: v.optional(v.string()),
		lastErrorMessage: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace_provider", ["workspaceId", "provider"])
		.index("by_provider_status", ["provider", "status"]),

	chatActionAuditLogs: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		eventId: v.string(),
		idempotencyKey: v.string(),
		actionType: v.string(),
		actionKind: v.union(
			v.literal("issue"),
			v.literal("triage"),
			v.literal("approval"),
			v.literal("unknown"),
		),
		actorUserId: v.optional(v.id("users")),
		chatUserId: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		result: v.union(
			v.literal("accepted"),
			v.literal("duplicate"),
			v.literal("invalid_auth"),
			v.literal("invalid_payload"),
			v.literal("unsupported_action"),
			v.literal("permission_denied"),
			v.literal("error"),
		),
		message: v.optional(v.string()),
		metadata: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_workspace_provider_created_at", [
			"workspaceId",
			"provider",
			"createdAt",
		])
		.index("by_workspace_actor_user_id_created_at", [
			"workspaceId",
			"actorUserId",
			"createdAt",
		])
		.index("by_workspace_provider_result_created_at", [
			"workspaceId",
			"provider",
			"result",
			"createdAt",
		])
		.index("by_idempotency_key", ["workspaceId", "idempotencyKey"]),

	chatPolicies: defineTable({
		workspaceId: v.id("workspaces"),
		provider: v.literal("google-chat"),
		enabled: v.boolean(),
		allowDirectMessages: v.boolean(),
		allowSpaces: v.boolean(),
		requireIdentityLink: v.boolean(),
		allowedIssueActionIds: v.optional(v.array(v.string())),
		requireActionConfirmation: v.optional(v.boolean()),
		// Rollout fields kept in schema for backward compat (out-of-scope code reads them).
		// No longer written to by chatIntegrations.ts. Will be removed in a follow-up.
		rolloutState: v.optional(
			v.union(
				v.literal("disabled"),
				v.literal("canary"),
				v.literal("general"),
				v.literal("emergency_off"),
			),
		),
		rolloutCanaryTargetIds: v.optional(v.array(v.string())),
		rolloutUpdatedBy: v.optional(v.id("users")),
		rolloutUpdatedAt: v.optional(v.number()),
		emergencyOffReason: v.optional(v.string()),
		emergencyOffAt: v.optional(v.number()),
		rolloutOverrideBy: v.optional(v.id("users")),
		rolloutOverrideAt: v.optional(v.number()),
		rolloutOverrideReason: v.optional(v.string()),
		updatedBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_provider", ["workspaceId", "provider"]),

	// ── GitHub Connections ───────────────────────────────────────────────────

	githubConnections: defineTable({
		workspaceId: v.id("workspaces"),
		projectId: v.id("projects"),
		repoOwner: v.string(),
		repoName: v.string(),
		defaultBranch: v.string(),
		accessToken: v.string(), // AES-256-GCM encrypted
		tokenType: v.string(),
		scope: v.string(),
		status: v.union(
			v.literal("active"),
			v.literal("disconnected"),
			v.literal("error"),
		),
		lastSyncAt: v.optional(v.number()),
		webhookId: v.optional(v.number()),
		webhookSecret: v.optional(v.string()),
		// Sync feature flags
		issueSyncEnabled: v.optional(v.boolean()),
		prSyncEnabled: v.optional(v.boolean()),
		commitSyncEnabled: v.optional(v.boolean()),
		lastPrSyncAt: v.optional(v.number()),
		lastIssueSyncAt: v.optional(v.number()),
		lastCommitSyncAt: v.optional(v.number()),
		createdBy: v.id("users"),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	})
		.index("by_project", ["projectId"])
		.index("by_workspace", ["workspaceId"])
		.index("by_repo", ["repoOwner", "repoName"]),

	// ── GitHub Pull Requests ────────────────────────────────────────────────

	githubPullRequests: defineTable({
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		githubId: v.number(),
		number: v.number(),
		title: v.string(),
		body: v.optional(v.string()),
		state: v.union(
			v.literal("open"),
			v.literal("closed"),
			v.literal("merged"),
			v.literal("draft"),
		),
		authorLogin: v.string(),
		authorAvatarUrl: v.optional(v.string()),
		headBranch: v.string(),
		baseBranch: v.string(),
		htmlUrl: v.string(),
		isDraft: v.boolean(),
		mergedAt: v.optional(v.number()),
		closedAt: v.optional(v.number()),
		reviewDecision: v.optional(
			v.union(
				v.literal("approved"),
				v.literal("changes_requested"),
				v.literal("review_required"),
				v.literal("pending"),
			),
		),
		linkedIssueId: v.optional(v.id("issues")),
		githubCreatedAt: v.number(),
		githubUpdatedAt: v.number(),
		syncedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_project_state", ["projectId", "state"])
		.index("by_github_id", ["connectionId", "githubId"])
		.index("by_number", ["connectionId", "number"])
		.index("by_linked_issue", ["linkedIssueId"])
		.index("by_head_branch", ["connectionId", "headBranch"]),

	// ── GitHub Commits ──────────────────────────────────────────────────────

	githubCommits: defineTable({
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		sha: v.string(),
		message: v.string(),
		authorLogin: v.string(),
		authorEmail: v.optional(v.string()),
		authorAvatarUrl: v.optional(v.string()),
		htmlUrl: v.string(),
		pullRequestId: v.optional(v.id("githubPullRequests")),
		linkedIssueId: v.optional(v.id("issues")),
		committedAt: v.number(),
		syncedAt: v.number(),
	})
		.index("by_project", ["projectId"])
		.index("by_sha", ["connectionId", "sha"])
		.index("by_pull_request", ["pullRequestId"])
		.index("by_linked_issue", ["linkedIssueId"])
		.index("by_project_committed", ["projectId", "committedAt"]),

	// ── GitHub Issue Sync ───────────────────────────────────────────────────

	githubIssueSync: defineTable({
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		githubIssueId: v.number(),
		githubIssueNumber: v.number(),
		githubIssueUrl: v.string(),
		claveIssueId: v.id("issues"),
		lastGithubUpdatedAt: v.optional(v.string()),
		lastClaveUpdatedAt: v.optional(v.number()),
		syncSource: v.union(
			v.literal("github"),
			v.literal("clave"),
			v.literal("initial"),
		),
		syncStatus: v.union(
			v.literal("synced"),
			v.literal("conflict"),
			v.literal("error"),
		),
		errorMessage: v.optional(v.string()),
		syncedAt: v.number(),
	})
		.index("by_github_issue", ["connectionId", "githubIssueId"])
		.index("by_clave_issue", ["claveIssueId"])
		.index("by_project", ["projectId"]),

	// ── Billing ──────────────────────────────────────────────────────────────

	plans: defineTable({
		key: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
		name: v.string(),
		description: v.optional(v.string()),
		stripePriceId: v.optional(v.string()),
		stripePriceIdYearly: v.optional(v.string()),
		limits: v.object({
			maxMembers: v.number(),
			maxStorageGb: v.number(),
			maxAiMessages: v.number(),
		}),
		features: v.array(v.string()),
		isActive: v.optional(v.boolean()),
	}).index("by_key", ["key"]),

	// ── Yjs Collaboration ────────────────────────────────────────────────────

	yjsDocuments: defineTable({
		documentId: v.id("documents"),
		updates: v.array(v.bytes()),
		snapshot: v.optional(v.bytes()),
		snapshotVersion: v.number(),
		updatedAt: v.number(),
	}).index("by_document", ["documentId"]),

	yjsAwareness: defineTable({
		documentId: v.id("documents"),
		clientId: v.number(),
		awarenessState: v.string(),
		lastActiveAt: v.number(),
	})
		.index("by_document_client", ["documentId", "clientId"])
		.index("by_document", ["documentId"]),

	yjsSnapshotsV3: defineTable({
		documentId: v.id("documents"),
		snapshot: v.optional(v.bytes()),
		snapshotVersion: v.number(),
		updatedAt: v.number(),
	}).index("by_document", ["documentId"]),

	yjsUpdatesV3: defineTable({
		documentId: v.id("documents"),
		update: v.bytes(),
		clientSessionId: v.string(),
		createdAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_document_created", ["documentId", "createdAt"]),

	yjsPresenceV3: defineTable({
		documentId: v.id("documents"),
		clientId: v.number(),
		clientSessionId: v.string(),
		userId: v.optional(v.id("users")),
		displayName: v.string(),
		color: v.string(),
		isGuest: v.boolean(),
		awarenessState: v.string(),
		lastActiveAt: v.number(),
	})
		.index("by_document", ["documentId"])
		.index("by_document_session", ["documentId", "clientSessionId"]),

	// ── Rate Limiting ─────────────────────────────────────────────────────────

	rateLimits: defineTable({
		key: v.string(),
		action: v.string(),
		timestamp: v.number(),
	}).index("by_key_action", ["key", "action"]),
});
