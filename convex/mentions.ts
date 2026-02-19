import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

/**
 * Search users, documents, and whiteboards for @mention autocomplete.
 * Returns up to 5 results per category, workspace-scoped.
 */
export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		term: v.string(),
	},
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const term = args.term.trim().toLowerCase();

		// Get workspace members (always load all for filtering)
		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const users: { id: string; name: string; image?: string }[] = [];
		for (const member of members) {
			const user = await ctx.db.get(member.userId);
			if (!user) continue;
			const name = user.name ?? user.email ?? "Unknown";
			if (term && !name.toLowerCase().includes(term)) continue;
			users.push({
				id: user._id,
				name,
				image:
					(user.avatarStorageId
						? await ctx.storage.getUrl(user.avatarStorageId)
						: null) ?? user.image,
			});
			if (users.length >= 5) break;
		}

		// Search documents by title
		let documents: { id: string; title: string; projectId?: string }[] = [];
		if (term) {
			const docs = await ctx.db
				.query("documents")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(5);
			documents = docs
				.filter((d) => !d.deletedAt)
				.map((d) => ({
					id: d._id,
					title: d.title,
					projectId: d.projectId as string | undefined,
				}));
		} else {
			// No term: return recent documents
			const docs = await ctx.db
				.query("documents")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.order("desc")
				.take(5);
			documents = docs
				.filter((d) => !d.deletedAt)
				.map((d) => ({
					id: d._id,
					title: d.title,
					projectId: d.projectId as string | undefined,
				}));
		}

		// Search whiteboards by title
		let whiteboards: { id: string; title: string; projectId?: string }[] = [];
		if (term) {
			const boards = await ctx.db
				.query("whiteboards")
				.withSearchIndex("search_title", (q) =>
					q.search("title", term).eq("workspaceId", args.workspaceId),
				)
				.take(5);
			whiteboards = boards
				.filter((w) => !w.deletedAt)
				.map((w) => ({
					id: w._id,
					title: w.title,
					projectId: w.projectId as string | undefined,
				}));
		} else {
			const boards = await ctx.db
				.query("whiteboards")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.order("desc")
				.take(5);
			whiteboards = boards
				.filter((w) => !w.deletedAt)
				.map((w) => ({
					id: w._id,
					title: w.title,
					projectId: w.projectId as string | undefined,
				}));
		}

		return { users, documents, whiteboards };
	},
});
