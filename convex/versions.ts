import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** List all app versions in reverse chronological order */
export const list = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id("appVersions"),
			_creationTime: v.number(),
			version: v.string(),
			releasedAt: v.number(),
			title: v.string(),
			features: v.array(v.string()),
			bugFixes: v.array(v.string()),
		}),
	),
	handler: async (ctx) => {
		const versions = await ctx.db
			.query("appVersions")
			.withIndex("by_released")
			.order("desc")
			.collect();
		return versions;
	},
});

/** Get the latest app version */
export const getLatest = query({
	args: {},
	returns: v.union(
		v.object({
			_id: v.id("appVersions"),
			_creationTime: v.number(),
			version: v.string(),
			releasedAt: v.number(),
			title: v.string(),
			features: v.array(v.string()),
			bugFixes: v.array(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const latest = await ctx.db
			.query("appVersions")
			.withIndex("by_released")
			.order("desc")
			.first();
		return latest;
	},
});

/** Mark the latest version as seen by the current user */
export const markSeen = mutation({
	args: { version: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		await ctx.db.patch(userId, { lastSeenVersion: args.version });
		return null;
	},
});

/** Seed the v0.1.0 version entry */
export const seedInitialVersion = mutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");

		// Check if v0.1.0 already exists
		const existing = await ctx.db
			.query("appVersions")
			.withIndex("by_released")
			.collect();
		if (existing.some((v) => v.version === "0.1.0")) {
			return null;
		}

		await ctx.db.insert("appVersions", {
			version: "0.1.0",
			releasedAt: Date.now(),
			title: "Initial Release",
			features: [
				"Real-time collaborative workspace with multi-user presence",
				"Collapsible icon sidebar with keyboard shortcuts menu",
				"Rich document editor with Yjs collaboration",
				"Excalidraw whiteboards with real-time sync",
				"Project management with milestones and sprints",
				"Issue tracking with list, board, and timeline views",
				"AI chat sidebar with thread management",
				"In-app documentation powered by Fumadocs",
			],
			bugFixes: [],
		});
		return null;
	},
});
