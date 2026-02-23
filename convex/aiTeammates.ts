import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

// ── Return value validator ──────────────────────────────────────────────────

const aiTeammateDoc = v.object({
	_id: v.id("aiTeammates"),
	_creationTime: v.number(),
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
});

// ── Queries ─────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(aiTeammateDoc),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const teammates = await ctx.db
			.query("aiTeammates")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		// Sort by name for stable ordering
		return teammates.sort((a, b) => a.name.localeCompare(b.name));
	},
});

export const get = query({
	args: {
		id: v.id("aiTeammates"),
	},
	returns: v.union(aiTeammateDoc, v.null()),
	handler: async (ctx, args) => {
		const teammate = await ctx.db.get(args.id);
		if (!teammate) return null;
		await requireWorkspaceMember(ctx, teammate.workspaceId);
		return teammate;
	},
});

export const getDefault = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(aiTeammateDoc, v.null()),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const defaultTeammate = await ctx.db
			.query("aiTeammates")
			.withIndex("by_workspace_default", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("isDefault", true),
			)
			.unique();
		return defaultTeammate;
	},
});

// ── Mutations ───────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		avatar: v.optional(v.string()),
		description: v.optional(v.string()),
		systemPrompt: v.string(),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		temperature: v.optional(v.number()),
		isDefault: v.optional(v.boolean()),
	},
	returns: v.id("aiTeammates"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);

		// Validate temperature range if provided
		if (
			args.temperature !== undefined &&
			(args.temperature < 0 || args.temperature > 2)
		) {
			throw new ConvexError("Temperature must be between 0.0 and 2.0");
		}

		const isDefault = args.isDefault ?? false;

		// If this teammate is the default, clear isDefault on all others
		if (isDefault) {
			await clearDefaultInWorkspace(ctx, args.workspaceId);
		}

		return await ctx.db.insert("aiTeammates", {
			workspaceId: args.workspaceId,
			name: args.name,
			avatar: args.avatar,
			description: args.description,
			systemPrompt: args.systemPrompt,
			model: args.model,
			enabledTools: args.enabledTools,
			temperature: args.temperature,
			isDefault,
			createdBy: userId,
		});
	},
});

export const update = mutation({
	args: {
		id: v.id("aiTeammates"),
		name: v.optional(v.string()),
		avatar: v.optional(v.string()),
		description: v.optional(v.string()),
		systemPrompt: v.optional(v.string()),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		temperature: v.optional(v.number()),
		isDefault: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const teammate = await ctx.db.get(args.id);
		if (!teammate) {
			throw new ConvexError("AI teammate not found");
		}
		await requireWorkspaceAdmin(ctx, teammate.workspaceId);

		// Validate temperature range if provided
		if (
			args.temperature !== undefined &&
			(args.temperature < 0 || args.temperature > 2)
		) {
			throw new ConvexError("Temperature must be between 0.0 and 2.0");
		}

		// If setting isDefault to true, clear isDefault on all others first
		if (args.isDefault === true && !teammate.isDefault) {
			await clearDefaultInWorkspace(ctx, teammate.workspaceId);
		}

		const patch: Record<string, unknown> = {};
		if (args.name !== undefined) patch.name = args.name;
		if (args.avatar !== undefined) patch.avatar = args.avatar;
		if (args.description !== undefined) patch.description = args.description;
		if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
		if (args.model !== undefined) patch.model = args.model;
		if (args.enabledTools !== undefined) patch.enabledTools = args.enabledTools;
		if (args.temperature !== undefined) patch.temperature = args.temperature;
		if (args.isDefault !== undefined) patch.isDefault = args.isDefault;

		if (Object.keys(patch).length > 0) {
			await ctx.db.patch(args.id, patch);
		}
		return null;
	},
});

export const remove = mutation({
	args: {
		id: v.id("aiTeammates"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const teammate = await ctx.db.get(args.id);
		if (!teammate) {
			throw new ConvexError("AI teammate not found");
		}
		await requireWorkspaceAdmin(ctx, teammate.workspaceId);

		// Hard delete
		await ctx.db.delete(args.id);
		return null;
	},
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Clear isDefault on all teammates in a workspace (used before setting a new default). */
async function clearDefaultInWorkspace(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	const currentDefaults = await ctx.db
		.query("aiTeammates")
		.withIndex("by_workspace_default", (q) =>
			q.eq("workspaceId", workspaceId).eq("isDefault", true),
		)
		.collect();
	for (const teammate of currentDefaults) {
		await ctx.db.patch(teammate._id, { isDefault: false });
	}
}
