import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";
import { customStatusValidator, statusCategoryValidator } from "./schema";
import { inferStatusCategory } from "./lib/statusCategory";

function slugifyKey(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48);
}

function dedupeKey(base: string, existing: ReadonlySet<string>): string {
	if (!existing.has(base)) return base;
	let i = 2;
	while (existing.has(`${base}_${i}`)) i += 1;
	return `${base}_${i}`;
}

const DEFAULT_STATUS_KEYS = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
] as const;

const DEFAULT_TYPE_KEYS = ["issue", "bug", "improvement", "feature"] as const;

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
		await requireWorkspaceMember(ctx, args.workspaceId);

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

/** Update custom status names, colors, and categories (admin only) */
export const updateStatuses = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		customStatuses: v.array(customStatusValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

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

/**
 * Persist the display order for the merged status list. Saves the user's
 * drag-to-reorder result as a flat key array; the effective hook then sorts
 * the merged statuses (defaults + customs) by this ordering.
 *
 * Why a separate field instead of reordering `customStatuses`:
 * - Default statuses aren't in `customStatuses`, so reordering an array of
 *   only customs can't move defaults around relative to them.
 * - A flat key list avoids touching existing custom items (preserving their
 *   colors/names if they happen to drift).
 */
export const reorderStatuses = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		orderedKeys: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		await ctx.db.patch(settings._id, {
			customStatusOrder: args.orderedKeys,
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
		await requireWorkspaceMember(ctx, args.workspaceId);

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

export const createCustomStatus = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		color: v.string(),
		category: v.optional(statusCategoryValidator),
	},
	returns: v.object({ key: v.string() }),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		const existing = new Set<string>();
		for (const k of DEFAULT_STATUS_KEYS) existing.add(k);
		for (const s of settings.customStatuses ?? []) existing.add(s.key);

		const base = slugifyKey(args.name);
		if (!base) throw new Error("Status name is required");
		const key = dedupeKey(base, existing);

		const category =
			args.category ?? inferStatusCategory({ key, name: args.name });

		await ctx.db.patch(settings._id, {
			customStatuses: [
				...(settings.customStatuses ?? []),
				{ key, name: args.name, color: args.color, category },
			],
		});

		return { key };
	},
});

export const updateCustomStatus = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		key: v.string(),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		category: v.optional(statusCategoryValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		const existing = settings.customStatuses ?? [];
		const has = existing.some((s) => s.key === args.key);
		const updated = has
			? existing.map((s) =>
					s.key === args.key
						? {
								...s,
								name: args.name ?? s.name,
								color: args.color ?? s.color,
								category: args.category ?? s.category,
							}
						: s,
				)
			: [
					...existing,
					{
						key: args.key,
						name: args.name ?? args.key.replaceAll("_", " "),
						color: args.color ?? "#6b7280",
						category:
							args.category ??
							inferStatusCategory({
								key: args.key,
								name: args.name,
							}),
					},
				];

		await ctx.db.patch(settings._id, { customStatuses: updated });
		return null;
	},
});

export const deleteCustomStatus = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		key: v.string(),
		replacementKey: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		if (args.key === args.replacementKey) {
			throw new Error("Replacement must be different");
		}

		if ((DEFAULT_STATUS_KEYS as readonly string[]).includes(args.key)) {
			throw new Error("Default statuses cannot be deleted");
		}

		const allowed = new Set<string>(DEFAULT_STATUS_KEYS);
		for (const s of settings.customStatuses ?? []) allowed.add(s.key);
		if (!allowed.has(args.replacementKey)) {
			throw new Error("Replacement status not found");
		}

		// Migrate issues
		const affected = await ctx.db
			.query("issues")
			.withIndex("by_workspace_status", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("status", args.key),
			)
			.collect();
		for (const issue of affected) {
			if (issue.deletedAt) continue;
			await ctx.db.patch(issue._id, { status: args.replacementKey });
		}

		await ctx.db.patch(settings._id, {
			customStatuses: (settings.customStatuses ?? []).filter(
				(s) => s.key !== args.key,
			),
		});

		return null;
	},
});

export const createCustomType = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		color: v.string(),
	},
	returns: v.object({ key: v.string() }),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		const existing = new Set<string>();
		for (const k of DEFAULT_TYPE_KEYS) existing.add(k);
		for (const t of settings.customTypes ?? []) existing.add(t.key);

		const base = slugifyKey(args.name);
		if (!base) throw new Error("Type name is required");
		const key = dedupeKey(base, existing);

		await ctx.db.patch(settings._id, {
			customTypes: [
				...(settings.customTypes ?? []),
				{ key, name: args.name, color: args.color },
			],
		});

		return { key };
	},
});

export const updateCustomType = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		key: v.string(),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		const existing = settings.customTypes ?? [];
		const has = existing.some((t) => t.key === args.key);
		const updated = has
			? existing.map((t) =>
					t.key === args.key
						? { ...t, name: args.name ?? t.name, color: args.color ?? t.color }
						: t,
				)
			: [
					...existing,
					{
						key: args.key,
						name: args.name ?? args.key.replaceAll("_", " "),
						color: args.color ?? "#6b7280",
					},
				];

		await ctx.db.patch(settings._id, { customTypes: updated });
		return null;
	},
});

export const deleteCustomType = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		key: v.string(),
		replacementKey: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new Error("Workspace settings not found");

		if (args.key === args.replacementKey) {
			throw new Error("Replacement must be different");
		}

		if ((DEFAULT_TYPE_KEYS as readonly string[]).includes(args.key)) {
			throw new Error("Default types cannot be deleted");
		}

		const allowed = new Set<string>(DEFAULT_TYPE_KEYS);
		for (const t of settings.customTypes ?? []) allowed.add(t.key);
		if (!allowed.has(args.replacementKey)) {
			throw new Error("Replacement type not found");
		}

		// Migrate issues (no index on type yet; query by workspace and filter)
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		for (const issue of issues) {
			if (issue.deletedAt) continue;
			if (issue.type !== args.key) continue;
			await ctx.db.patch(issue._id, { type: args.replacementKey });
		}

		await ctx.db.patch(settings._id, {
			customTypes: (settings.customTypes ?? []).filter(
				(t) => t.key !== args.key,
			),
		});

		return null;
	},
});
