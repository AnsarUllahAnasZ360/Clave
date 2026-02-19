import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		clientId: v.id("clients"),
	},
	returns: v.array(
		v.object({
			_id: v.id("clientContacts"),
			_creationTime: v.number(),
			clientId: v.id("clients"),
			name: v.string(),
			email: v.optional(v.string()),
			phone: v.optional(v.string()),
			role: v.optional(v.string()),
			isPrimary: v.optional(v.boolean()),
			createdBy: v.optional(v.id("users")),
		}),
	),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) return [];
		await requireWorkspaceMember(ctx, client.workspaceId);

		return await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
			.collect();
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		clientId: v.id("clients"),
		name: v.string(),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		role: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
	},
	returns: v.id("clientContacts"),
	handler: async (ctx, args) => {
		const client = await ctx.db.get(args.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, client.workspaceId);

		const isPrimary = args.isPrimary ?? false;

		// If setting as primary, unset any existing primary contact
		if (isPrimary) {
			const existingContacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", args.clientId))
				.collect();
			for (const contact of existingContacts) {
				if (contact.isPrimary) {
					await ctx.db.patch(contact._id, { isPrimary: false });
				}
			}
		}

		const contactId = await ctx.db.insert("clientContacts", {
			clientId: args.clientId,
			name: args.name,
			email: args.email,
			phone: args.phone,
			role: args.role,
			isPrimary,
			createdBy: userId,
		});

		return contactId;
	},
});

export const update = mutation({
	args: {
		contactId: v.id("clientContacts"),
		name: v.optional(v.string()),
		email: v.optional(v.string()),
		phone: v.optional(v.string()),
		role: v.optional(v.string()),
		isPrimary: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const contact = await ctx.db.get(args.contactId);
		if (!contact) {
			throw new ConvexError("Contact not found");
		}
		const client = await ctx.db.get(contact.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		await requireWorkspaceMember(ctx, client.workspaceId);

		// If setting as primary, unset any existing primary contact
		if (args.isPrimary) {
			const existingContacts = await ctx.db
				.query("clientContacts")
				.withIndex("by_client", (q) => q.eq("clientId", contact.clientId))
				.collect();
			for (const c of existingContacts) {
				if (c._id !== args.contactId && c.isPrimary) {
					await ctx.db.patch(c._id, { isPrimary: false });
				}
			}
		}

		const { contactId, ...updates } = args;
		await ctx.db.patch(contactId, updates);
	},
});

export const remove = mutation({
	args: {
		contactId: v.id("clientContacts"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const contact = await ctx.db.get(args.contactId);
		if (!contact) {
			throw new ConvexError("Contact not found");
		}
		const client = await ctx.db.get(contact.clientId);
		if (!client || client.deletedAt) {
			throw new ConvexError("Client not found");
		}
		await requireWorkspaceMember(ctx, client.workspaceId);

		await ctx.db.delete(args.contactId);
	},
});
