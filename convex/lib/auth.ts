import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Get authenticated user ID or throw */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
	const userId = await getAuthUserId(ctx);
	if (!userId) throw new ConvexError("Not authenticated");
	return userId;
}

/** Check workspace membership, return userId and member record */
export async function requireWorkspaceMember(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	const userId = await requireAuth(ctx);
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	if (!member) throw new ConvexError("Not a workspace member");
	return { userId, member };
}

/** Check workspace membership without throwing. Returns null if not authenticated or not a member. */
export async function tryWorkspaceMember(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	const userId = await getAuthUserId(ctx);
	if (!userId) return null;
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();
	if (!member) return null;
	return { userId, member };
}

/**
 * Check if a user can read a document based on the three-tier access model.
 * Returns { userId, canRead } -- userId may be null for unauthenticated users.
 * Does NOT throw on unauthenticated access for public documents.
 */
export async function checkDocumentReadAccess(
	ctx: QueryCtx | MutationCtx,
	document: {
		_id: Id<"documents">;
		workspaceId: Id<"workspaces">;
		visibility?: string;
		deletedAt?: number;
	},
): Promise<{ userId: Id<"users"> | null; canRead: boolean }> {
	if (document.deletedAt) return { userId: null, canRead: false };

	const userId = await getAuthUserId(ctx);
	const visibility = document.visibility ?? "private";

	// Public documents are readable by anyone
	if (visibility === "public") {
		return { userId, canRead: true };
	}

	// All remaining checks require authentication
	if (!userId) return { userId: null, canRead: false };

	// Workspace members can always read workspace-visible (or private) documents
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", document.workspaceId).eq("userId", userId),
		)
		.unique();
	if (member) return { userId, canRead: true };

	// Check per-user share grants
	if (visibility === "workspace" || visibility === "private") {
		const share = await ctx.db
			.query("documentShares")
			.withIndex("by_document_user", (q) =>
				q.eq("documentId", document._id).eq("userId", userId),
			)
			.unique();
		if (share) return { userId, canRead: true };
	}

	return { userId, canRead: false };
}

/**
 * Check if a user can write to a document.
 * Returns { userId, canWrite }. Allows unauthenticated writes for public
 * documents with defaultPermission="edit".
 */
export async function checkDocumentWriteAccess(
	ctx: QueryCtx | MutationCtx,
	document: {
		_id: Id<"documents">;
		workspaceId: Id<"workspaces">;
		visibility?: string;
		defaultPermission?: string;
		deletedAt?: number;
	},
): Promise<{ userId: Id<"users"> | null; canWrite: boolean }> {
	if (document.deletedAt) return { userId: null, canWrite: false };

	const userId = await getAuthUserId(ctx);

	// Public documents with edit permission are writable by anyone
	if (
		!userId &&
		document.visibility === "public" &&
		document.defaultPermission === "edit"
	) {
		return { userId: null, canWrite: true };
	}

	if (!userId) return { userId: null, canWrite: false };

	// Workspace members can always write
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", document.workspaceId).eq("userId", userId),
		)
		.unique();
	if (member) return { userId, canWrite: true };

	// Check per-user share grants with edit permission
	const share = await ctx.db
		.query("documentShares")
		.withIndex("by_document_user", (q) =>
			q.eq("documentId", document._id).eq("userId", userId),
		)
		.unique();
	if (share?.permission === "edit") return { userId, canWrite: true };

	// Check default permission for shared access
	if (document.defaultPermission === "edit") {
		const { canRead } = await checkDocumentReadAccess(ctx, document);
		if (canRead) return { userId, canWrite: true };
	}

	return { userId, canWrite: false };
}

/**
 * Check if a user can read a whiteboard based on the three-tier access model.
 * Returns { userId, canRead } -- userId may be null for unauthenticated users.
 * Does NOT throw on unauthenticated access for public whiteboards.
 */
export async function checkWhiteboardReadAccess(
	ctx: QueryCtx | MutationCtx,
	whiteboard: {
		_id: Id<"whiteboards">;
		workspaceId: Id<"workspaces">;
		visibility?: string;
		deletedAt?: number;
	},
): Promise<{ userId: Id<"users"> | null; canRead: boolean }> {
	if (whiteboard.deletedAt) return { userId: null, canRead: false };

	const userId = await getAuthUserId(ctx);
	const visibility = whiteboard.visibility ?? "private";

	// Public whiteboards are readable by anyone
	if (visibility === "public") {
		return { userId, canRead: true };
	}

	// All remaining checks require authentication
	if (!userId) return { userId: null, canRead: false };

	// Workspace members can always read workspace-visible (or private) whiteboards
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", whiteboard.workspaceId).eq("userId", userId),
		)
		.unique();
	if (member) return { userId, canRead: true };

	// Check per-user share grants
	if (visibility === "workspace" || visibility === "private") {
		const share = await ctx.db
			.query("whiteboardShares")
			.withIndex("by_whiteboard_user", (q) =>
				q.eq("whiteboardId", whiteboard._id).eq("userId", userId),
			)
			.unique();
		if (share) return { userId, canRead: true };
	}

	return { userId, canRead: false };
}

/**
 * Check if a user can write to a whiteboard.
 * Returns { userId, canWrite }. Allows unauthenticated writes for public
 * whiteboards with defaultPermission="edit".
 */
export async function checkWhiteboardWriteAccess(
	ctx: QueryCtx | MutationCtx,
	whiteboard: {
		_id: Id<"whiteboards">;
		workspaceId: Id<"workspaces">;
		visibility?: string;
		defaultPermission?: string;
		deletedAt?: number;
	},
): Promise<{ userId: Id<"users"> | null; canWrite: boolean }> {
	if (whiteboard.deletedAt) return { userId: null, canWrite: false };

	const userId = await getAuthUserId(ctx);

	// Public whiteboards with edit permission are writable by anyone
	if (
		!userId &&
		whiteboard.visibility === "public" &&
		whiteboard.defaultPermission === "edit"
	) {
		return { userId: null, canWrite: true };
	}

	if (!userId) return { userId: null, canWrite: false };

	// Workspace members can always write
	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", whiteboard.workspaceId).eq("userId", userId),
		)
		.unique();
	if (member) return { userId, canWrite: true };

	// Check per-user share grants with edit permission
	const share = await ctx.db
		.query("whiteboardShares")
		.withIndex("by_whiteboard_user", (q) =>
			q.eq("whiteboardId", whiteboard._id).eq("userId", userId),
		)
		.unique();
	if (share?.permission === "edit") return { userId, canWrite: true };

	// Check default permission for shared access
	if (whiteboard.defaultPermission === "edit") {
		const { canRead } = await checkWhiteboardReadAccess(ctx, whiteboard);
		if (canRead) return { userId, canWrite: true };
	}

	return { userId, canWrite: false };
}

// ── Organization Auth Helpers ──────────────────────────────────────────────

/** Check organization membership, return userId and member record */
export async function requireOrgMember(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
) {
	const userId = await requireAuth(ctx);
	const member = await ctx.db
		.query("organizationMembers")
		.withIndex("by_org_user", (q) =>
			q.eq("organizationId", organizationId).eq("userId", userId),
		)
		.unique();
	if (!member) throw new ConvexError("Not an organization member");
	return { userId, member };
}

/** Require organization admin or owner role */
export async function requireOrgAdmin(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
) {
	const { userId, member } = await requireOrgMember(ctx, organizationId);
	if (member.role !== "admin" && member.role !== "owner") {
		throw new ConvexError("Organization admin access required");
	}
	return { userId, member };
}

/** Require organization owner role */
export async function requireOrgOwner(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
) {
	const { userId, member } = await requireOrgMember(ctx, organizationId);
	if (member.role !== "owner") {
		throw new ConvexError("Organization owner access required");
	}
	return { userId, member };
}

/** Require superadmin platform role */
export async function requireSuperAdmin(ctx: QueryCtx | MutationCtx) {
	const userId = await requireAuth(ctx);
	const user = await ctx.db.get(userId);
	if (!user || user.role !== "superadmin") {
		throw new ConvexError("Superadmin access required");
	}
	return userId;
}

// ── Workspace Auth Helpers ────────────────────────────────────────────────

/** Check workspace admin role, return userId and member record */
export async function requireWorkspaceAdmin(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	const { userId, member } = await requireWorkspaceMember(ctx, workspaceId);
	if (member.role !== "admin") throw new ConvexError("Admin access required");
	return { userId, member };
}

// ── RBAC Helpers ──────────────────────────────────────────────────────────

/**
 * Check if a user can access a specific project.
 * Admin: always true. Member: true if createdBy, leadId, or in projectMembers.
 */
export async function canAccessProject(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	userId: Id<"users">,
	memberRole: "admin" | "member",
): Promise<boolean> {
	if (memberRole === "admin") return true;

	const project = await ctx.db.get(projectId);
	if (!project || project.deletedAt) return false;

	if (project.createdBy === userId) return true;
	if (project.leadId === userId) return true;

	const membership = await ctx.db
		.query("projectMembers")
		.withIndex("by_project_user", (q) =>
			q.eq("projectId", projectId).eq("userId", userId),
		)
		.unique();
	return !!membership;
}

/**
 * Get set of project IDs a member user can access.
 * Returns null for admins (meaning "all projects").
 */
export async function getAccessibleProjectIds(
	ctx: QueryCtx | MutationCtx,
	workspaceId: Id<"workspaces">,
	userId: Id<"users">,
	memberRole: "admin" | "member",
): Promise<Set<string> | null> {
	if (memberRole === "admin") return null;

	// Parallel fetch: workspace projects + user's project memberships
	const [allProjects, memberships] = await Promise.all([
		ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("projectMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect(),
	]);

	const ids = new Set<string>();
	for (const p of allProjects) {
		if (p.deletedAt) continue;
		if (p.createdBy === userId || p.leadId === userId) {
			ids.add(p._id);
		}
	}
	for (const m of memberships) {
		ids.add(m.projectId);
	}

	return ids;
}

/**
 * Require that the current user can access a project.
 * Throws if member user lacks access. Returns auth context.
 */
export async function requireProjectAccess(
	ctx: QueryCtx | MutationCtx,
	projectId: Id<"projects">,
	workspaceId: Id<"workspaces">,
) {
	const { userId, member } = await requireWorkspaceMember(ctx, workspaceId);
	if (member.role !== "admin") {
		const hasAccess = await canAccessProject(
			ctx,
			projectId,
			userId,
			member.role,
		);
		if (!hasAccess) {
			throw new ConvexError("You don't have access to this project");
		}
	}
	return { userId, member };
}
