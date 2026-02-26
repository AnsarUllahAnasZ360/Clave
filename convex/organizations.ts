import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
	requireAuth,
	requireOrgAdmin,
	requireOrgMember,
	requireOrgOwner,
} from "./lib/auth";
import { generateSlug } from "./lib/utils";

/** List all organizations the authenticated user is a member of */
export const list = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("organizations"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			plan: v.optional(
				v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
			),
			suspended: v.optional(v.boolean()),
			createdAt: v.optional(v.number()),
			updatedAt: v.optional(v.number()),
			deletedAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		const memberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		// Batch-fetch all organization details in parallel
		const orgResults = await Promise.all(
			memberships.map((m) => ctx.db.get(m.organizationId)),
		);

		return orgResults.filter(
			(o): o is NonNullable<typeof o> => o !== null && !o.deletedAt,
		);
	},
});

/** Get an organization by its ID */
export const getById = query({
	args: { organizationId: v.id("organizations") },
	returns: v.union(
		v.object({
			_id: v.id("organizations"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			plan: v.optional(
				v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
			),
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
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		const org = await ctx.db.get(args.organizationId);
		if (!org || org.deletedAt) return null;

		try {
			await requireOrgMember(ctx, org._id);
			return org;
		} catch {
			// Non-member: strip sensitive billing fields
			const {
				stripeCustomerId,
				subscriptionId,
				subscriptionStatus,
				billingEmail,
				trialEndsAt,
				...safe
			} = org;
			return safe;
		}
	},
});

/** Get an organization by its slug */
export const getBySlug = query({
	args: { slug: v.string() },
	returns: v.union(
		v.object({
			_id: v.id("organizations"),
			_creationTime: v.number(),
			name: v.string(),
			slug: v.string(),
			ownerId: v.id("users"),
			description: v.optional(v.string()),
			logoStorageId: v.optional(v.id("_storage")),
			plan: v.optional(
				v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
			),
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
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		const org = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();

		if (!org || org.deletedAt) return null;

		try {
			await requireOrgMember(ctx, org._id);
			return org;
		} catch {
			// Non-member: strip sensitive billing fields
			const {
				stripeCustomerId,
				subscriptionId,
				subscriptionStatus,
				billingEmail,
				trialEndsAt,
				...safe
			} = org;
			return safe;
		}
	},
});

/** Create a new organization and add creator as owner */
export const create = mutation({
	args: {
		name: v.string(),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	returns: v.id("organizations"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		const slug = args.slug || generateSlug(args.name);

		// Check slug uniqueness
		const existing = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", slug))
			.unique();
		if (existing) {
			throw new ConvexError(
				"An organization with this slug already exists. Please choose a different name.",
			);
		}

		const now = Date.now();

		// Create the organization
		const organizationId = await ctx.db.insert("organizations", {
			name: args.name,
			slug,
			ownerId: userId,
			description: args.description,
			plan: "free",
			createdAt: now,
			updatedAt: now,
		});

		// Add creator as owner member
		await ctx.db.insert("organizationMembers", {
			organizationId,
			userId,
			role: "owner",
			joinedAt: now,
		});

		// Auto-create demo workspace for new organizations
		await ctx.scheduler.runAfter(0, internal.demo.seed.initDemoWorkspace, {
			organizationId,
			creatorUserId: userId,
		});

		return organizationId;
	},
});

/** Update organization name, slug, description, or logo (admin/owner only) */
export const update = mutation({
	args: {
		organizationId: v.id("organizations"),
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		description: v.optional(v.string()),
		logoStorageId: v.optional(v.id("_storage")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOrgAdmin(ctx, args.organizationId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.logoStorageId !== undefined)
			patch.logoStorageId = args.logoStorageId;

		// Validate and update slug
		if (args.slug !== undefined) {
			const normalized = args.slug
				.toLowerCase()
				.replace(/[^a-z0-9-]/g, "")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "");
			if (normalized.length < 2) {
				throw new ConvexError("Slug must be at least 2 characters");
			}
			// Check uniqueness (allow same org to keep its slug)
			const existing = await ctx.db
				.query("organizations")
				.withIndex("by_slug", (q) => q.eq("slug", normalized))
				.unique();
			if (existing && existing._id !== args.organizationId) {
				throw new ConvexError("An organization with this slug already exists");
			}
			patch.slug = normalized;
		}

		await ctx.db.patch(args.organizationId, patch);
		return null;
	},
});

/** Soft-delete an organization (owner only) */
export const remove = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOrgOwner(ctx, args.organizationId);

		await ctx.db.patch(args.organizationId, { deletedAt: Date.now() });
		return null;
	},
});

/** Generate a logo upload URL (admin/owner only) */
export const generateLogoUploadUrl = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.string(),
	handler: async (ctx, args) => {
		await requireOrgAdmin(ctx, args.organizationId);
		return await ctx.storage.generateUploadUrl();
	},
});

/** Get the logo URL for an organization */
export const getLogoUrl = query({
	args: { organizationId: v.id("organizations") },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		await requireAuth(ctx);
		const org = await ctx.db.get(args.organizationId);
		if (!org || !org.logoStorageId) return null;
		return await ctx.storage.getUrl(org.logoStorageId);
	},
});
