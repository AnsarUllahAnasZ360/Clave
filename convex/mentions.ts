import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

/**
 * Search users, documents, whiteboards, and sub-agents for @mention autocomplete.
 * Returns up to 5 results per category, workspace-scoped.
 */
export const search = query({
	args: {
		workspaceId: v.id("workspaces"),
		term: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const term = args.term.trim().toLowerCase();

		// Get workspace members (always load all for filtering)
		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		// Batch-fetch all users in parallel
		const userResults = await Promise.all(
			members.map((m) => ctx.db.get(m.userId)),
		);

		// Filter by term and take top 5
		const matchedUsers: Array<{
			user: NonNullable<(typeof userResults)[0]>;
			name: string;
		}> = [];
		for (let i = 0; i < userResults.length; i++) {
			const user = userResults[i];
			if (!user) continue;
			const name = user.name ?? user.email ?? "Unknown";
			if (term && !name.toLowerCase().includes(term)) continue;
			matchedUsers.push({ user, name });
			if (matchedUsers.length >= 5) break;
		}

		// Resolve avatar URLs in parallel for matched users
		const avatarUrls = await Promise.all(
			matchedUsers.map(({ user }) =>
				user.avatarStorageId
					? ctx.storage.getUrl(user.avatarStorageId)
					: Promise.resolve(null),
			),
		);

		const users = matchedUsers.map(({ user, name }, i) => ({
			id: user._id,
			name,
			image: avatarUrls[i] ?? user.image,
		}));

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

		// Search sub-agents (personal, shared, and presets visible to user)
		const allAgents = await ctx.db
			.query("subAgents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const agents: {
			id: string;
			name: string;
			description: string;
			avatar?: string;
			isShared: boolean;
			isPreset: boolean;
		}[] = [];
		for (const agent of allAgents) {
			// Visibility: personal (creator only), shared, or preset
			if (!agent.isShared && !agent.isPreset && agent.createdBy !== userId)
				continue;
			if (term && !agent.name.toLowerCase().includes(term)) continue;
			agents.push({
				id: agent._id,
				name: agent.name,
				description: agent.description,
				avatar: agent.avatar,
				isShared: agent.isShared,
				isPreset: agent.isPreset,
			});
			if (agents.length >= 5) break;
		}

		return { users, documents, whiteboards, agents };
	},
});
