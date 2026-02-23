import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { getAccessibleProjectIds, requireWorkspaceMember } from "./lib/auth";

// ── Validators ─────────────────────────────────────────────────────────────

const clientWithContactValidator = v.object({
	_id: v.id("clients"),
	_creationTime: v.number(),
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
	primaryContactName: v.optional(v.string()),
	primaryContactEmail: v.optional(v.string()),
});

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
		status: v.optional(
			v.union(
				v.literal("prospect"),
				v.literal("active"),
				v.literal("on_hold"),
				v.literal("completed"),
				v.literal("archived"),
			),
		),
	},
	returns: v.array(clientWithContactValidator),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		const status = args.status;
		const clients = status
			? await ctx.db
					.query("clients")
					.withIndex("by_workspace_status", (q) =>
						q.eq("workspaceId", args.workspaceId).eq("status", status),
					)
					.collect()
			: await ctx.db
					.query("clients")
					.withIndex("by_workspace", (q) =>
						q.eq("workspaceId", args.workspaceId),
					)
					.collect();

		let active = clients.filter((c) => !c.deletedAt);

		// RBAC: members see clients linked to accessible projects or created by them
		if (member.role !== "admin") {
			const accessibleProjectIds = await getAccessibleProjectIds(
				ctx,
				args.workspaceId,
				userId,
				member.role as "admin" | "member",
			);
			if (accessibleProjectIds !== null) {
				// Find client IDs linked to accessible projects
				const accessibleClientIds = new Set<string>();
				const projects = await ctx.db
					.query("projects")
					.withIndex("by_workspace", (q) =>
						q.eq("workspaceId", args.workspaceId),
					)
					.collect();
				for (const p of projects) {
					if (!p.deletedAt && p.clientId && accessibleProjectIds.has(p._id)) {
						accessibleClientIds.add(p.clientId);
					}
				}
				active = active.filter(
					(c) => accessibleClientIds.has(c._id) || c.createdBy === userId,
				);
			}
		}

		// Enrich with primary contact info for list display
		const enriched = await Promise.all(
			active.map(async (client) => {
				const contacts = await ctx.db
					.query("clientContacts")
					.withIndex("by_client", (q) => q.eq("clientId", client._id))
					.collect();
				const primary = contacts.find((c) => c.isPrimary);
				return {
					...client,
					primaryContactName: primary?.name as string | undefined,
					primaryContactEmail: primary?.email as string | undefined,
				};
			}),
		);

		return enriched;
	},
});

export const getById = query({
	args: {
		clientId: v.id("clients"),
	},
	returns: v.union(clientWithContactValidator, v.null()),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			client.workspaceId,
		);

		// RBAC: members can only see clients linked to accessible projects or created by them
		if (member.role !== "admin") {
			const accessibleProjectIds = await getAccessibleProjectIds(
				ctx,
				client.workspaceId,
				userId,
				member.role as "admin" | "member",
			);
			if (accessibleProjectIds !== null) {
				const linkedProjects = await ctx.db
					.query("projects")
					.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
					.collect();
				const hasAccessibleProject = linkedProjects.some(
					(p) => !p.deletedAt && accessibleProjectIds.has(p._id),
				);
				if (!hasAccessibleProject && client.createdBy !== userId) return null;
			}
		}

		// Enrich with primary contact info
		const contacts = await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();
		const primary = contacts.find((c) => c.isPrimary);

		return {
			...client,
			primaryContactName: primary?.name as string | undefined,
			primaryContactEmail: primary?.email as string | undefined,
		};
	},
});

export const getProjects = query({
	args: {
		clientId: v.id("clients"),
	},
	returns: v.array(
		v.object({
			_id: v.id("projects"),
			_creationTime: v.number(),
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
		}),
	),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) return [];
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			client.workspaceId,
		);

		const projects = await ctx.db
			.query("projects")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();

		let filtered = projects.filter((p) => !p.deletedAt);

		// RBAC: members only see accessible projects
		if (member.role !== "admin") {
			const accessibleProjectIds = await getAccessibleProjectIds(
				ctx,
				client.workspaceId,
				userId,
				member.role as "admin" | "member",
			);
			if (accessibleProjectIds !== null) {
				filtered = filtered.filter((p) => accessibleProjectIds.has(p._id));
			}
		}

		return filtered;
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		status: v.optional(
			v.union(
				v.literal("prospect"),
				v.literal("active"),
				v.literal("on_hold"),
				v.literal("completed"),
				v.literal("archived"),
			),
		),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		location: v.optional(v.string()),
		segment: v.optional(v.string()),
		ownerId: v.optional(v.id("users")),
		notes: v.optional(v.string()),
		// Primary contact (optional, creates a clientContact record)
		primaryContactName: v.optional(v.string()),
		primaryContactEmail: v.optional(v.string()),
	},
	returns: v.id("clients"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const clientId = await ctx.db.insert("clients", {
			workspaceId: args.workspaceId,
			name: args.name,
			status: args.status ?? "prospect",
			industry: args.industry,
			website: args.website,
			location: args.location,
			segment: args.segment,
			ownerId: args.ownerId,
			notes: args.notes,
			createdBy: userId,
		});

		// Create primary contact if provided
		if (args.primaryContactName) {
			await ctx.db.insert("clientContacts", {
				clientId,
				name: args.primaryContactName,
				email: args.primaryContactEmail,
				isPrimary: true,
				createdBy: userId,
			});
		}

		// Activity log
		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "client",
			entityId: clientId,
			action: "created",
			actorId: userId,
			description: `created client "${args.name}"`,
			clientId,
		});

		return clientId;
	},
});

export const update = mutation({
	args: {
		clientId: v.id("clients"),
		name: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("prospect"),
				v.literal("active"),
				v.literal("on_hold"),
				v.literal("completed"),
				v.literal("archived"),
			),
		),
		industry: v.optional(v.string()),
		website: v.optional(v.string()),
		location: v.optional(v.string()),
		segment: v.optional(v.string()),
		ownerId: v.optional(v.id("users")),
		notes: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			client.workspaceId,
		);

		// RBAC: admin or creator only
		if (member.role !== "admin" && client.createdBy !== userId) {
			throw new ConvexError(
				"Only admins or the creator can update this client",
			);
		}

		const { clientId, ...updates } = args;
		await ctx.db.patch(clientId, {
			...updates,
			updatedAt: Date.now(),
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: client.workspaceId,
			entityType: "client",
			entityId: clientId,
			action: "updated",
			actorId: userId,
			description: `updated client "${client.name}"`,
			clientId,
		});
	},
});

export const updateStatus = mutation({
	args: {
		clientId: v.id("clients"),
		status: v.union(
			v.literal("prospect"),
			v.literal("active"),
			v.literal("on_hold"),
			v.literal("completed"),
			v.literal("archived"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		await requireWorkspaceMember(ctx, client.workspaceId);

		await ctx.db.patch(args.clientId, {
			status: args.status,
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		clientId: v.id("clients"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			client.workspaceId,
		);

		// RBAC: admin or creator only
		if (member.role !== "admin" && client.createdBy !== userId) {
			throw new ConvexError(
				"Only admins or the creator can delete this client",
			);
		}

		await ctx.db.patch(args.clientId, {
			deletedAt: Date.now(),
		});
	},
});

export const bulkArchive = mutation({
	args: {
		clientIds: v.array(v.id("clients")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (args.clientIds.length === 0) return;

		// Verify auth on first client's workspace
		const first = await ctx.db.get(args.clientIds[0]);
		if (!first || first.deletedAt) {
			throw new ConvexError("Client not found");
		}
		await requireWorkspaceMember(ctx, first.workspaceId);

		for (const clientId of args.clientIds) {
			const client = await ctx.db.get(clientId);
			if (client && !client.deletedAt) {
				await ctx.db.patch(clientId, {
					status: "archived",
					updatedAt: Date.now(),
				});
			}
		}
	},
});
