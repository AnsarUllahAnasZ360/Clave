import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

const customItemValidator = v.object({
	key: v.string(),
	name: v.string(),
	color: v.string(),
});

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

/** Get settings for a workspace */
export const get = query({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		return settings;
	},
});

/** Update workspace settings (admin only) */
export const update = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		storyPrefix: v.optional(v.string()),
		defaultProjectStatus: v.optional(v.string()),
		defaultStoryStatus: v.optional(v.string()),
		accentColor: v.optional(v.string()),
		aiWorkspaceContext: v.optional(v.string()),
		aiAssistantCharacteristics: v.optional(v.string()),
		workspaceSlashCommands: v.optional(v.array(slashCommandValidator)),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) throw new Error("Workspace settings not found");

		const patch: Record<string, unknown> = {};
		if (args.storyPrefix !== undefined) patch.storyPrefix = args.storyPrefix;
		if (args.defaultProjectStatus !== undefined)
			patch.defaultProjectStatus = args.defaultProjectStatus;
		if (args.defaultStoryStatus !== undefined)
			patch.defaultStoryStatus = args.defaultStoryStatus;
		if (args.accentColor !== undefined) patch.accentColor = args.accentColor;
		if (args.aiWorkspaceContext !== undefined)
			patch.aiWorkspaceContext = args.aiWorkspaceContext;
		if (args.aiAssistantCharacteristics !== undefined)
			patch.aiAssistantCharacteristics = args.aiAssistantCharacteristics;
		if (args.workspaceSlashCommands !== undefined)
			patch.workspaceSlashCommands = args.workspaceSlashCommands;

		if (Object.keys(patch).length > 0) {
			await ctx.db.patch(settings._id, patch);
		}

		return null;
	},
});

/** Update custom type names and colors (admin only) */
export const updateTypes = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		customTypes: v.array(customItemValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) throw new Error("Workspace settings not found");

		await ctx.db.patch(settings._id, {
			customTypes: args.customTypes,
		});

		return null;
	},
});

/** Update custom status names and colors (admin only) */
export const updateStatuses = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		customStatuses: v.array(customItemValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) throw new Error("Workspace settings not found");

		await ctx.db.patch(settings._id, {
			customStatuses: args.customStatuses,
		});

		return null;
	},
});

/** Update custom priority names and colors (admin only) */
export const updatePriorities = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		customPriorities: v.array(customItemValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();

		if (!settings) throw new Error("Workspace settings not found");

		await ctx.db.patch(settings._id, {
			customPriorities: args.customPriorities,
		});

		return null;
	},
});
