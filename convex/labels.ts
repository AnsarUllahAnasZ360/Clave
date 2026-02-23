import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex } from "./lib/utils";

/** Check if a label is soft-deleted */
function isLabelDeleted(label: { deletedAt?: number }): boolean {
	return !!label.deletedAt;
}

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("labels"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			name: v.string(),
			color: v.string(),
			description: v.optional(v.string()),
			sortOrder: v.optional(v.number()),
			createdBy: v.optional(v.id("users")),
			createdAt: v.optional(v.number()),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const labels = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		return labels.filter((l) => !isLabelDeleted(l));
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		color: v.string(),
		description: v.optional(v.string()),
	},
	returns: v.id("labels"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);

		// Check name uniqueness within workspace
		const existing = await ctx.db
			.query("labels")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		const activeLabels = existing.filter((l) => !isLabelDeleted(l));
		if (activeLabels.some((l) => l.name === args.name)) {
			throw new ConvexError("A label with this name already exists");
		}

		// Compute sortOrder: append at end
		const lastOrder =
			activeLabels.length > 0
				? Math.max(...activeLabels.map((l) => l.sortOrder ?? 0))
				: null;
		const sortOrder = fractionalIndex(lastOrder, null);

		return await ctx.db.insert("labels", {
			workspaceId: args.workspaceId,
			name: args.name,
			color: args.color,
			description: args.description,
			sortOrder,
			createdBy: userId,
			createdAt: Date.now(),
		});
	},
});

export const update = mutation({
	args: {
		labelId: v.id("labels"),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const label = await ctx.db.get(args.labelId);
		if (!label) {
			throw new ConvexError("Label not found");
		}
		await requireWorkspaceAdmin(ctx, label.workspaceId);

		// Check name uniqueness if name is being changed
		if (args.name !== undefined && args.name !== label.name) {
			const existing = await ctx.db
				.query("labels")
				.withIndex("by_workspace", (q) =>
					q.eq("workspaceId", label.workspaceId),
				)
				.collect();
			if (
				existing.some(
					(l) =>
						!isLabelDeleted(l) &&
						l._id !== args.labelId &&
						l.name === args.name,
				)
			) {
				throw new ConvexError("A label with this name already exists");
			}
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.color !== undefined) patch.color = args.color;
		if (args.description !== undefined) patch.description = args.description;

		await ctx.db.patch(args.labelId, patch);
	},
});

export const remove = mutation({
	args: {
		labelId: v.id("labels"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const label = await ctx.db.get(args.labelId);
		if (!label) {
			throw new ConvexError("Label not found");
		}
		await requireWorkspaceAdmin(ctx, label.workspaceId);

		// Soft delete using deletedAt timestamp
		await ctx.db.patch(args.labelId, {
			deletedAt: Date.now(),
			updatedAt: Date.now(),
		});

		// Remove this label from any issues that reference it
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", label.workspaceId))
			.collect();

		for (const issue of issues) {
			if (issue.labelIds?.includes(args.labelId)) {
				await ctx.db.patch(issue._id, {
					labelIds: issue.labelIds.filter((id) => id !== args.labelId),
					updatedAt: Date.now(),
				});
			}
		}
	},
});
