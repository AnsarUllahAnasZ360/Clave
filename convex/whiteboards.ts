import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import {
	canAccessProject,
	checkWhiteboardReadAccess,
	checkWhiteboardWriteAccess,
	getAccessibleProjectIds,
	requireWorkspaceMember,
} from "./lib/auth";
import { createNotification, notifyUsers } from "./lib/notifications";
import { getRandomEmoji } from "./lib/randomEmoji";

/** List whiteboards for a project, excluding soft-deleted, sorted by sortOrder */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
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

		const whiteboards = await ctx.db
			.query("whiteboards")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		return whiteboards
			.filter((w) => !w.deletedAt)
			.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	},
});

/** List whiteboards for a workspace, excluding soft-deleted, sorted by most recently updated */
export const listByWorkspace = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
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

		const whiteboards = await ctx.db
			.query("whiteboards")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.order("desc")
			.take(200);

		const filtered = whiteboards.filter((w) => {
			if (w.deletedAt) return false;
			if (accessibleProjectIds !== null) {
				if (w.projectId) return accessibleProjectIds.has(w.projectId);
				return w.createdBy === userId;
			}
			return true;
		});

		// Collect unique user IDs and batch-fetch
		const userIds = new Set<string>();
		for (const wb of filtered) {
			if (wb.createdBy) userIds.add(wb.createdBy);
			if (wb.lastEditedBy) userIds.add(wb.lastEditedBy);
		}
		const userPromises = Array.from(userIds).map(async (uid) => {
			const user = await ctx.db.get(uid as Id<"users">);
			if (!user) return null;

			let avatarUrl: string | undefined = user.image;
			if (user.avatarStorageId) {
				const url = await ctx.storage.getUrl(user.avatarStorageId);
				if (url) avatarUrl = url;
			}

			return {
				uid,
				data: {
					name: user.name,
					image: user.image,
					avatarUrl,
				},
			};
		});
		const userEntries = await Promise.all(userPromises);

		const userMap = new Map<
			string,
			{ name?: string; image?: string; avatarUrl?: string }
		>();
		for (const entry of userEntries) {
			if (!entry) continue;
			userMap.set(entry.uid, {
				name: entry.data.name,
				image: entry.data.image,
				avatarUrl: entry.data.avatarUrl,
			});
		}

		return filtered.map((wb) => {
			const creator = wb.createdBy ? userMap.get(wb.createdBy) : undefined;
			const editor = wb.lastEditedBy ? userMap.get(wb.lastEditedBy) : undefined;
			return {
				...wb,
				creatorName: creator?.name,
				creatorImage: creator?.avatarUrl ?? creator?.image,
				lastEditorName: editor?.name,
				lastEditorImage: editor?.avatarUrl ?? editor?.image,
			};
		});
	},
});

/** Get a single whiteboard by ID -- supports workspace members and shared users */
export const getById = query({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) return null;

		// Try workspace membership first (fast path)
		try {
			const { userId, member } = await requireWorkspaceMember(
				ctx,
				whiteboard.workspaceId,
			);

			// RBAC: members can only see whiteboards in accessible projects or their own
			if (member.role !== "admin" && whiteboard.projectId) {
				const hasAccess = await canAccessProject(
					ctx,
					whiteboard.projectId,
					userId,
					member.role as "admin" | "member",
				);
				if (!hasAccess && whiteboard.createdBy !== userId) return null;
			}

			return whiteboard;
		} catch {
			// Fall through to check whiteboard-level access
		}

		// Check whiteboard-level read access (shared users, public)
		const { canRead } = await checkWhiteboardReadAccess(ctx, whiteboard);
		if (canRead) return whiteboard;

		return null;
	},
});

/** Create a new whiteboard */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
	},
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
			if (!hasAccess) throw new Error("You don't have access to this project");
		}

		const whiteboardId = await ctx.db.insert("whiteboards", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			title: args.title,
			icon: getRandomEmoji(),
			sceneData: "[]",
			appState: "{}",
			sortOrder: Date.now(),
			createdBy: userId,
			lastEditedBy: userId,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "whiteboard",
			entityId: whiteboardId,
			action: "created",
			actorId: userId,
			description: `Created whiteboard "${args.title}"`,
			projectId: args.projectId,
			whiteboardId,
		});

		// Notify project members when a whiteboard is created in a project
		if (args.projectId) {
			const projectId = args.projectId;
			const members = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", projectId))
				.collect();
			const memberUserIds = members.map((m) => m.userId);
			await notifyUsers(ctx, memberUserIds, {
				workspaceId: args.workspaceId,
				type: "whiteboard_update",
				title: `New whiteboard: "${args.title}"`,
				preview: `Created a new whiteboard in the project`,
				projectId,
				whiteboardId,
				actorId: userId,
			});
		}

		return whiteboardId;
	},
});

/** Update whiteboard scene data -- uses write access check for shared editors */
export const updateScene = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		sceneData: v.string(),
		appState: v.string(),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");

		const { userId, canWrite } = await checkWhiteboardWriteAccess(
			ctx,
			whiteboard,
		);
		if (!canWrite) throw new Error("No write access");

		const updates: Record<string, unknown> = {
			sceneData: args.sceneData,
			appState: args.appState,
			updatedAt: Date.now(),
		};
		if (userId) {
			updates.lastEditedBy = userId;
		}

		await ctx.db.patch(args.whiteboardId, updates);
	},
});

/** Update whiteboard metadata (title, icon, thumbnail, pin status) */
export const updateMetadata = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		title: v.optional(v.string()),
		icon: v.optional(v.string()),
		thumbnailStorageId: v.optional(v.id("_storage")),
		isPinned: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const updates: Record<string, unknown> = {
			lastEditedBy: userId,
			updatedAt: Date.now(),
		};
		if (args.title !== undefined) updates.title = args.title;
		if (args.icon !== undefined) updates.icon = args.icon;
		if (args.thumbnailStorageId !== undefined)
			updates.thumbnailStorageId = args.thumbnailStorageId;
		if (args.isPinned !== undefined) updates.isPinned = args.isPinned;

		await ctx.db.patch(args.whiteboardId, updates);

		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: args.whiteboardId,
			action: "updated",
			actorId: userId,
			description: `Updated whiteboard "${args.title ?? whiteboard.title}"`,
			projectId: whiteboard.projectId,
			whiteboardId: args.whiteboardId,
		});
	},
});

/** Duplicate a whiteboard with " (copy)" suffix */
export const duplicate = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const newId = await ctx.db.insert("whiteboards", {
			workspaceId: whiteboard.workspaceId,
			projectId: whiteboard.projectId,
			title: `${whiteboard.title} (copy)`,
			icon: whiteboard.icon ?? getRandomEmoji(),
			sceneData: whiteboard.sceneData,
			appState: whiteboard.appState,
			sortOrder: Date.now(),
			createdBy: userId,
			lastEditedBy: userId,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: newId,
			action: "created",
			actorId: userId,
			description: `Duplicated whiteboard "${whiteboard.title}"`,
			projectId: whiteboard.projectId,
			whiteboardId: newId,
		});

		return newId;
	},
});

/** Link a whiteboard to a project by setting its projectId */
export const linkToProject = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) throw new Error("Project not found");

		await ctx.db.patch(args.whiteboardId, {
			projectId: args.projectId,
			updatedAt: Date.now(),
		});
	},
});

/** Unlink a whiteboard from its project by clearing projectId */
export const unlinkFromProject = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		const { _id, _creationTime, projectId: _removed, ...rest } = whiteboard;
		await ctx.db.replace(args.whiteboardId, {
			...rest,
			updatedAt: Date.now(),
		});
	},
});

/** Soft-delete a whiteboard */
export const remove = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		// RBAC: verify project access or creator for member users
		if (member.role !== "admin" && whiteboard.projectId) {
			const hasAccess = await canAccessProject(
				ctx,
				whiteboard.projectId,
				userId,
				member.role as "admin" | "member",
			);
			if (!hasAccess && whiteboard.createdBy !== userId)
				throw new Error("You don't have access to this whiteboard");
		}

		await ctx.db.patch(args.whiteboardId, {
			deletedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: args.whiteboardId,
			action: "deleted",
			actorId: userId,
			description: `Deleted whiteboard "${whiteboard.title}"`,
			projectId: whiteboard.projectId,
			whiteboardId: args.whiteboardId,
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

/** Look up a whiteboard by share token -- public access, limited projection */
export const getByShareToken = query({
	args: {
		token: v.string(),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db
			.query("whiteboards")
			.withIndex("by_share_token", (q) => q.eq("shareToken", args.token))
			.unique();

		if (!whiteboard || whiteboard.deletedAt) return null;

		const visibility = whiteboard.visibility ?? "private";

		// Public whiteboards are accessible to anyone
		if (visibility === "public") {
			return {
				_id: whiteboard._id,
				title: whiteboard.title,
				icon: whiteboard.icon,
				sceneData: whiteboard.sceneData,
				appState: whiteboard.appState,
				visibility: whiteboard.visibility,
				defaultPermission: whiteboard.defaultPermission,
			};
		}

		// Workspace-visible whiteboards require workspace membership
		if (visibility === "workspace") {
			const { canRead, userId } = await checkWhiteboardReadAccess(
				ctx,
				whiteboard,
			);
			if (canRead) {
				return {
					_id: whiteboard._id,
					title: whiteboard.title,
					icon: whiteboard.icon,
					sceneData: whiteboard.sceneData,
					appState: whiteboard.appState,
					visibility: whiteboard.visibility,
					defaultPermission: whiteboard.defaultPermission,
					workspaceId: userId ? whiteboard.workspaceId : undefined,
				};
			}
		}

		// Private whiteboards with a token still need explicit share grants
		if (visibility === "private") {
			const { canRead } = await checkWhiteboardReadAccess(ctx, whiteboard);
			if (canRead) {
				return {
					_id: whiteboard._id,
					title: whiteboard.title,
					icon: whiteboard.icon,
					sceneData: whiteboard.sceneData,
					appState: whiteboard.appState,
					visibility: whiteboard.visibility,
					defaultPermission: whiteboard.defaultPermission,
				};
			}
		}

		return null;
	},
});

/** Get share settings for a whiteboard -- requires workspace membership */
export const getShareSettings = query({
	args: {
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt) return null;
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		// Get all share records with resolved user data
		const shares = await ctx.db
			.query("whiteboardShares")
			.withIndex("by_whiteboard", (q) =>
				q.eq("whiteboardId", args.whiteboardId),
			)
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
			visibility: whiteboard.visibility ?? "private",
			shareToken: whiteboard.shareToken,
			defaultPermission: whiteboard.defaultPermission ?? "view",
			shares: resolvedShares,
		};
	},
});

/** Update share settings (visibility and default permission) */
export const updateShareSettings = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		visibility: v.union(
			v.literal("private"),
			v.literal("workspace"),
			v.literal("public"),
		),
		defaultPermission: v.optional(
			v.union(v.literal("view"), v.literal("edit")),
		),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const updates: Record<string, unknown> = {
			visibility: args.visibility,
			updatedAt: Date.now(),
		};

		if (args.defaultPermission !== undefined) {
			updates.defaultPermission = args.defaultPermission;
		}

		// Auto-generate share token when first moving away from private
		if (args.visibility !== "private" && !whiteboard.shareToken) {
			updates.shareToken = generateShareToken();
		}

		await ctx.db.patch(args.whiteboardId, updates);

		const oldVisibility = whiteboard.visibility ?? "private";
		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: args.whiteboardId,
			action: "share_settings_updated",
			actorId: userId,
			description: `Changed whiteboard sharing from "${oldVisibility}" to "${args.visibility}"`,
			whiteboardId: args.whiteboardId,
			field: "visibility",
			oldValue: oldVisibility,
			newValue: args.visibility,
		});
	},
});

/** Grant a specific user view or edit permission */
export const addShare = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		userId: v.id("users"),
		permission: v.union(v.literal("view"), v.literal("edit")),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId: actorId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		// Check target user exists
		const targetUser = await ctx.db.get(args.userId);
		if (!targetUser) throw new Error("User not found");

		// Check if share already exists
		const existing = await ctx.db
			.query("whiteboardShares")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("userId", args.userId),
			)
			.unique();

		if (existing) {
			// Update existing share permission
			await ctx.db.patch(existing._id, { permission: args.permission });
		} else {
			await ctx.db.insert("whiteboardShares", {
				whiteboardId: args.whiteboardId,
				userId: args.userId,
				permission: args.permission,
				grantedBy: actorId,
				grantedAt: Date.now(),
			});
		}

		// Notify the target user
		await createNotification(ctx, {
			userId: args.userId,
			workspaceId: whiteboard.workspaceId,
			type: "whiteboard_update",
			title: `Shared whiteboard: "${whiteboard.title}"`,
			preview: `You were given ${args.permission} access`,
			whiteboardId: args.whiteboardId,
			actorId,
		});

		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: args.whiteboardId,
			action: "share_added",
			actorId,
			description: `Shared whiteboard with ${targetUser.name ?? targetUser.email ?? "a user"} (${args.permission})`,
			whiteboardId: args.whiteboardId,
		});
	},
});

/** Remove a per-user share */
export const removeShare = mutation({
	args: {
		whiteboardId: v.id("whiteboards"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		await requireWorkspaceMember(ctx, whiteboard.workspaceId);

		const share = await ctx.db
			.query("whiteboardShares")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", args.whiteboardId).eq("userId", args.userId),
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
		whiteboardId: v.id("whiteboards"),
	},
	handler: async (ctx, args) => {
		const whiteboard = await ctx.db.get(args.whiteboardId);
		if (!whiteboard || whiteboard.deletedAt)
			throw new Error("Whiteboard not found");
		const { userId } = await requireWorkspaceMember(
			ctx,
			whiteboard.workspaceId,
		);

		const newToken = generateShareToken();
		await ctx.db.patch(args.whiteboardId, {
			shareToken: newToken,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: whiteboard.workspaceId,
			entityType: "whiteboard",
			entityId: args.whiteboardId,
			action: "share_token_regenerated",
			actorId: userId,
			description: "Regenerated share link (old links invalidated)",
			whiteboardId: args.whiteboardId,
		});
	},
});
