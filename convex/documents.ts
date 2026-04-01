import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import {
	canAccessProject,
	checkDocumentReadAccess,
	checkDocumentWriteAccess,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";
import { createNotification, notifyUsers } from "./lib/notifications";
import { getRandomEmoji } from "./lib/randomEmoji";

/** List documents for a project, excluding soft-deleted, sorted by sortOrder */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			_creationTime: v.number(),
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
		}),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);

		// RBAC: check project access for member users
		if (member.role !== "admin") {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess) return [];
		}

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		return documents
			.filter((d) => !d.deletedAt)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	},
});

/** List documents for a workspace, excluding soft-deleted, sorted by most recently updated */
export const listByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("documents"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			projectId: v.optional(v.id("projects")),
			title: v.string(),
			icon: v.optional(v.string()),
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
			creatorName: v.optional(v.string()),
			creatorImage: v.optional(v.string()),
			lastEditorName: v.optional(v.string()),
			lastEditorImage: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role as "admin" | "member",
		);

		const documents = await ctx.db
			.query("documents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.take(200);

		const filtered = documents.filter((d) => {
			if (d.deletedAt) return false;
			// RBAC: members see docs in accessible projects or their own (no project)
			if (accessibleProjectIds !== null) {
				if (d.projectId) return accessibleProjectIds.has(d.projectId);
				return d.createdBy === userId;
			}
			return true;
		});

		// Collect unique user IDs and batch-fetch in parallel
		const userIds = new Set<string>();
		for (const doc of filtered) {
			if (doc.createdBy) userIds.add(doc.createdBy);
			if (doc.lastEditedBy) userIds.add(doc.lastEditedBy);
		}
		const userIdArray = [...userIds];
		const userResults = await Promise.all(
			userIdArray.map((uid) => ctx.db.get(uid as Id<"users">)),
		);

		// Resolve avatar URLs in parallel for users with avatar storage
		const avatarEntries: Array<{ idx: number; storageId: Id<"_storage"> }> = [];
		for (let i = 0; i < userResults.length; i++) {
			const user = userResults[i];
			if (user?.avatarStorageId) {
				avatarEntries.push({ idx: i, storageId: user.avatarStorageId });
			}
		}
		const avatarUrlResults = await Promise.all(
			avatarEntries.map((e) => ctx.storage.getUrl(e.storageId)),
		);
		const avatarUrlMap = new Map<number, string | null>();
		for (let i = 0; i < avatarEntries.length; i++) {
			avatarUrlMap.set(avatarEntries[i].idx, avatarUrlResults[i]);
		}

		const userMap = new Map<
			string,
			{ name?: string; image?: string; avatarUrl?: string }
		>();
		for (let i = 0; i < userIdArray.length; i++) {
			const user = userResults[i];
			if (user) {
				const avatarUrl = avatarUrlMap.get(i) ?? undefined;
				userMap.set(userIdArray[i], {
					name: user.name,
					image: user.image,
					avatarUrl: avatarUrl ?? user.image,
				});
			}
		}

		return filtered.map((doc) => {
			const creator = doc.createdBy ? userMap.get(doc.createdBy) : undefined;
			const editor = doc.lastEditedBy
				? userMap.get(doc.lastEditedBy)
				: undefined;
			// Strip content field — only needed when opening a specific doc
			const { content: _content, ...rest } = doc;
			return {
				...rest,
				creatorName: creator?.name,
				creatorImage: creator?.avatarUrl ?? creator?.image,
				lastEditorName: editor?.name,
				lastEditorImage: editor?.avatarUrl ?? editor?.image,
			};
		});
	},
});

/** Get a single document by ID -- supports workspace members and shared users */
export const getById = query({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.union(
		v.object({
			_id: v.id("documents"),
			_creationTime: v.number(),
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
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return null;

		// Try workspace membership first (fast path)
		try {
			const { userId, member } = await requireWorkspaceMember(
				ctx,
				document.workspaceId,
			);

			// RBAC: members can only see docs in accessible projects or their own
			if (member.role !== "admin" && document.projectId) {
				const hasAccess = await canAccessProject(
					ctx,
					document.projectId,
					userId,
					member.role as "admin" | "member",
				);
				if (!hasAccess && document.createdBy !== userId) return null;
			}

			return document;
		} catch {
			// Fall through to check document-level access
		}

		// Check document-level read access (shared users, public)
		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (canRead) return document;

		return null;
	},
});

/** Create a new document */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		content: v.optional(v.string()),
	},
	returns: v.id("documents"),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		// RBAC: verify project access for member users
		if (member.role !== "admin" && args.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				args.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess)
				throw new ConvexError("You don't have access to this project");
		}

		const documentId = await ctx.db.insert("documents", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			title: args.title,
			content: args.content,
			icon: getRandomEmoji(),
			sortOrder: Date.now(),
			createdBy: userId,
			lastEditedBy: userId,
			updatedAt: Date.now(),
			syncVersion: "v3",
		});

		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "document",
			entityId: documentId,
			action: "created",
			actorId: userId,
			description: `Created document "${args.title}"`,
			projectId: args.projectId,
			documentId,
		});

		// Notify project members when a document is created in a project
		if (args.projectId) {
			const projectId = args.projectId;
			const members = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", projectId))
				.collect();
			const memberUserIds = members.map((m) => m.userId);
			await notifyUsers(ctx, memberUserIds, {
				workspaceId: args.workspaceId,
				type: "document_update",
				title: `New document: "${args.title}"`,
				preview: `Created a new document in the project`,
				projectId: args.projectId,
				documentId,
				actorId: userId,
			});
		}

		return documentId;
	},
});

/** Update a document's metadata (title, icon, cover, pin status) */
export const update = mutation({
	args: {
		documentId: v.id("documents"),
		title: v.optional(v.string()),
		icon: v.optional(v.string()),
		coverStorageId: v.optional(v.id("_storage")),
		coverPositionY: v.optional(v.number()),
		removeCoverImage: v.optional(v.boolean()),
		isPinned: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			document.workspaceId,
		);

		// RBAC: verify project access or creator for member users
		if (member.role !== "admin" && document.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				document.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && document.createdBy !== userId)
				throw new ConvexError("You don't have access to this document");
		}

		const updates: Record<string, unknown> = {
			lastEditedBy: userId,
			updatedAt: Date.now(),
		};
		if (args.title !== undefined) updates.title = args.title;
		if (args.icon !== undefined) updates.icon = args.icon;
		if (args.coverStorageId !== undefined)
			updates.coverStorageId = args.coverStorageId;
		if (args.coverPositionY !== undefined)
			updates.coverPositionY = args.coverPositionY;
		if (args.isPinned !== undefined) updates.isPinned = args.isPinned;

		// Handle cover image removal by replacing the entire document to clear the optional field
		if (args.removeCoverImage) {
			const {
				_id,
				_creationTime,
				coverStorageId: _removed,
				...rest
			} = document;
			await ctx.db.replace(args.documentId, {
				...rest,
				...updates,
			});
		} else {
			await ctx.db.patch(args.documentId, updates);
		}

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "updated",
			actorId: userId,
			description: `Updated document "${args.title ?? document.title}"`,
			projectId: document.projectId,
			documentId: args.documentId,
		});

		// Schedule RAG re-indexing if title changed (affects indexed content)
		if (args.title !== undefined && args.title !== document.title) {
			await ctx.scheduler.runAfter(
				0,
				internal.ai.indexing.documentIndexer.indexDocument,
				{ documentId: args.documentId },
			);
		}
	},
});

/** Update a document's content only (no activity logging -- too frequent) */
export const updateContent = mutation({
	args: {
		documentId: v.id("documents"),
		content: v.string(),
		syncVersion: v.optional(v.string()),
		forceIndex: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");

		const { userId, canWrite } = await checkDocumentWriteAccess(ctx, document);
		if (!canWrite) throw new ConvexError("No write access");

		const now = Date.now();
		const updates: Record<string, unknown> = {
			content: args.content,
			updatedAt: now,
		};
		if (userId) {
			updates.lastEditedBy = userId;
		}
		if (args.syncVersion) {
			updates.syncVersion = args.syncVersion;
		}

		await ctx.db.patch(args.documentId, updates);

		// Throttle indexing to reduce background action churn during active typing.
		const shouldIndex =
			args.forceIndex === true ||
			!document.updatedAt ||
			now - document.updatedAt > 30_000;
		if (shouldIndex) {
			await ctx.scheduler.runAfter(
				0,
				internal.ai.indexing.documentIndexer.indexDocument,
				{ documentId: args.documentId },
			);
		}
	},
});

/** Duplicate a document with " (copy)" suffix */
export const duplicate = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.id("documents"),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId } = await requireWorkspaceMember(ctx, document.workspaceId);

		const newId = await ctx.db.insert("documents", {
			workspaceId: document.workspaceId,
			projectId: document.projectId,
			title: `${document.title} (copy)`,
			content: document.content,
			icon: document.icon,
			sortOrder: Date.now(),
			createdBy: userId,
			lastEditedBy: userId,
			updatedAt: Date.now(),
			syncVersion: "v3",
		});

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: newId,
			action: "created",
			actorId: userId,
			description: `Duplicated document "${document.title}"`,
			projectId: document.projectId,
			documentId: newId,
		});

		return newId;
	},
});

/** Soft-delete a document */
export const remove = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			document.workspaceId,
		);

		// RBAC: verify project access or creator for member users
		if (member.role !== "admin" && document.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				document.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && document.createdBy !== userId)
				throw new ConvexError("You don't have access to this document");
		}

		await ctx.db.patch(args.documentId, {
			deletedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "deleted",
			actorId: userId,
			description: `Deleted document "${document.title}"`,
			projectId: document.projectId,
			documentId: args.documentId,
		});

		// Schedule RAG de-indexing (async, non-blocking)
		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.documentIndexer.indexDocument,
			{ documentId: args.documentId },
		);
	},
});

/** Link a document to a project by setting its projectId */
export const linkToProject = mutation({
	args: {
		documentId: v.id("documents"),
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		await requireWorkspaceMember(ctx, document.workspaceId);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt)
			throw new ConvexError("Project not found");

		await ctx.db.patch(args.documentId, {
			projectId: args.projectId,
			updatedAt: Date.now(),
		});
	},
});

/** Unlink a document from its project by clearing projectId */
export const unlinkFromProject = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		await requireWorkspaceMember(ctx, document.workspaceId);

		// Use replace to clear optional field
		const { _id, _creationTime, projectId: _removed, ...rest } = document;
		await ctx.db.replace(args.documentId, {
			...rest,
			updatedAt: Date.now(),
		});
	},
});

// ── Sharing Functions ────────────────────────────────────────────────────

function generateShareToken(): string {
	const bytes = new Uint8Array(12);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Look up a document by share token -- public access, limited projection */
export const getByShareToken = query({
	args: {
		token: v.string(),
	},
	returns: v.union(
		v.object({
			_id: v.id("documents"),
			title: v.string(),
			content: v.optional(v.string()),
			icon: v.optional(v.string()),
			coverStorageId: v.optional(v.id("_storage")),
			coverPositionY: v.optional(v.number()),
			visibility: v.optional(v.string()),
			defaultPermission: v.optional(v.string()),
			workspaceId: v.optional(v.id("workspaces")),
			syncVersion: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db
			.query("documents")
			.withIndex("by_share_token", (q) => q.eq("shareToken", args.token))
			.unique();

		if (!document || document.deletedAt) return null;

		const visibility = document.visibility ?? "private";

		// Public documents are accessible to anyone
		if (visibility === "public") {
			return {
				_id: document._id,
				title: document.title,
				content: document.content,
				icon: document.icon,
				coverStorageId: document.coverStorageId,
				coverPositionY: document.coverPositionY,
				visibility: document.visibility,
				defaultPermission: document.defaultPermission,
				syncVersion: document.syncVersion,
			};
		}

		// Workspace-visible documents require workspace membership
		if (visibility === "workspace") {
			const { canRead, userId } = await checkDocumentReadAccess(ctx, document);
			if (canRead) {
				return {
					_id: document._id,
					title: document.title,
					content: document.content,
					icon: document.icon,
					coverStorageId: document.coverStorageId,
					coverPositionY: document.coverPositionY,
					visibility: document.visibility,
					defaultPermission: document.defaultPermission,
					workspaceId: userId ? document.workspaceId : undefined,
					syncVersion: document.syncVersion,
				};
			}
		}

		// Private documents with a token still need explicit share grants
		if (visibility === "private") {
			const { canRead } = await checkDocumentReadAccess(ctx, document);
			if (canRead) {
				return {
					_id: document._id,
					title: document.title,
					content: document.content,
					icon: document.icon,
					coverStorageId: document.coverStorageId,
					coverPositionY: document.coverPositionY,
					visibility: document.visibility,
					defaultPermission: document.defaultPermission,
					syncVersion: document.syncVersion,
				};
			}
		}

		return null;
	},
});

/** Get share settings for a document -- requires workspace membership */
export const getShareSettings = query({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.union(
		v.object({
			visibility: v.string(),
			shareToken: v.optional(v.string()),
			defaultPermission: v.string(),
			shares: v.array(
				v.object({
					_id: v.id("documentShares"),
					userId: v.id("users"),
					permission: v.string(),
					grantedAt: v.optional(v.number()),
					userName: v.string(),
					userEmail: v.string(),
					userImage: v.optional(v.string()),
				}),
			),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt) return null;
		await requireWorkspaceMember(ctx, document.workspaceId);

		// Get all share records with resolved user data
		const shares = await ctx.db
			.query("documentShares")
			.withIndex("by_document", (q) => q.eq("documentId", args.documentId))
			.collect();

		const resolvedShares = await Promise.all(
			shares.map(async (share) => {
				const user = await ctx.db.get(share.userId);
				return {
					_id: share._id,
					userId: share.userId,
					permission: share.permission,
					grantedAt: share.grantedAt,
					userName: user?.name ?? "Unknown",
					userEmail: user?.email ?? "",
					userImage:
						(user?.avatarStorageId
							? await ctx.storage.getUrl(user.avatarStorageId)
							: null) ?? user?.image,
				};
			}),
		);

		return {
			visibility: document.visibility ?? "private",
			shareToken: document.shareToken,
			defaultPermission: document.defaultPermission ?? "view",
			shares: resolvedShares,
		};
	},
});

/** Update share settings (visibility and default permission) */
export const updateShareSettings = mutation({
	args: {
		documentId: v.id("documents"),
		visibility: v.union(
			v.literal("private"),
			v.literal("workspace"),
			v.literal("public"),
		),
		defaultPermission: v.optional(
			v.union(v.literal("view"), v.literal("edit")),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId } = await requireWorkspaceMember(ctx, document.workspaceId);

		const updates: Record<string, unknown> = {
			visibility: args.visibility,
			updatedAt: Date.now(),
		};

		if (args.defaultPermission !== undefined) {
			updates.defaultPermission = args.defaultPermission;
		}

		// Auto-generate share token when first moving away from private
		if (args.visibility !== "private" && !document.shareToken) {
			updates.shareToken = generateShareToken();
		}

		await ctx.db.patch(args.documentId, updates);

		const oldVisibility = document.visibility ?? "private";
		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "share_settings_updated",
			actorId: userId,
			description: `Changed document sharing from "${oldVisibility}" to "${args.visibility}"`,
			documentId: args.documentId,
			field: "visibility",
			oldValue: oldVisibility,
			newValue: args.visibility,
		});
	},
});

/** Grant a specific user view or edit permission */
export const addShare = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
		permission: v.union(v.literal("view"), v.literal("edit")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId: actorId } = await requireWorkspaceMember(
			ctx,
			document.workspaceId,
		);

		// Check target user exists
		const targetUser = await ctx.db.get(args.userId);
		if (!targetUser) throw new ConvexError("User not found");

		// Check if share already exists
		const existing = await ctx.db
			.query("documentShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", args.documentId).eq("userId", args.userId),
			)
			.unique();

		if (existing) {
			// Update existing share permission
			await ctx.db.patch(existing._id, { permission: args.permission });
		} else {
			await ctx.db.insert("documentShares", {
				documentId: args.documentId,
				userId: args.userId,
				permission: args.permission,
				grantedBy: actorId,
				grantedAt: Date.now(),
			});
		}

		// Notify the target user
		await createNotification(ctx, {
			userId: args.userId,
			workspaceId: document.workspaceId,
			type: "document_update",
			title: `Shared document: "${document.title}"`,
			preview: `You were given ${args.permission} access`,
			documentId: args.documentId,
			actorId,
		});

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "share_added",
			actorId,
			description: `Shared document with ${targetUser.name ?? targetUser.email ?? "a user"} (${args.permission})`,
			documentId: args.documentId,
		});
	},
});

/** Remove a per-user share */
export const removeShare = mutation({
	args: {
		documentId: v.id("documents"),
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		await requireWorkspaceMember(ctx, document.workspaceId);

		const share = await ctx.db
			.query("documentShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", args.documentId).eq("userId", args.userId),
			)
			.unique();

		if (share) {
			await ctx.db.delete(share._id);
		}
	},
});

/** Regenerate share token, invalidating all existing links */
export const regenerateShareToken = mutation({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const document = await ctx.db.get(args.documentId);
		if (!document || document.deletedAt)
			throw new ConvexError("Document not found");
		const { userId } = await requireWorkspaceMember(ctx, document.workspaceId);

		const newToken = generateShareToken();
		await ctx.db.patch(args.documentId, {
			shareToken: newToken,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: document.workspaceId,
			entityType: "document",
			entityId: args.documentId,
			action: "share_token_regenerated",
			actorId: userId,
			description: "Regenerated share link (old links invalidated)",
			documentId: args.documentId,
		});
	},
});
