import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

function sameDate(a?: number, b?: number): boolean {
	return (a ?? undefined) === (b ?? undefined);
}

export const migrateProjectMilestonesToSprints = mutation({
	args: {
		projectId: v.id("projects"),
		clearLegacyMilestoneLinks: v.optional(v.boolean()),
	},
	returns: v.object({
		projectId: v.id("projects"),
		migratedMilestones: v.number(),
		reusedSprints: v.number(),
		updatedIssues: v.number(),
	}),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { member } = await requireWorkspaceMember(ctx, project.workspaceId);
		if (member.role !== "admin") {
			throw new ConvexError("Only workspace admins can run sprint migration");
		}

		const milestones = await ctx.db
			.query("milestones")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();
		const activeMilestones = milestones.filter((m) => !m.deletedAt);

		const existingSprints = await ctx.db
			.query("sprints")
			.withIndex("by_project_sort", (q) => q.eq("projectId", args.projectId))
			.collect();
		const activeSprints = existingSprints.filter((s) => !s.deletedAt);

		const map = new Map<string, string>();
		let migratedMilestones = 0;
		let reusedSprints = 0;

		for (const milestone of activeMilestones) {
			const existing = activeSprints.find(
				(s) =>
					s.name === milestone.name &&
					sameDate(s.startDate, milestone.startDate) &&
					sameDate(s.targetDate ?? s.endDate, milestone.targetDate) &&
					sameDate(s.sortOrder, milestone.sortOrder),
			);

			if (existing) {
				reusedSprints += 1;
				map.set(milestone._id as string, existing._id as string);
				continue;
			}

			const sprintId = await ctx.db.insert("sprints", {
				projectId: milestone.projectId,
				name: milestone.name,
				description: milestone.description,
				status: milestone.status,
				icon: milestone.icon,
				startDate: milestone.startDate,
				targetDate: milestone.targetDate,
				endDate: milestone.targetDate,
				sortOrder: milestone.sortOrder,
				createdBy: milestone.createdBy,
				updatedAt: milestone.updatedAt,
			});
			migratedMilestones += 1;
			map.set(milestone._id as string, sprintId as string);
		}

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		let updatedIssues = 0;

		for (const issue of issues) {
			if (issue.deletedAt) continue;
			if (!issue.milestoneId) continue;

			const sprintId = map.get(issue.milestoneId as string);
			if (!sprintId) continue;

			// Never overwrite a different, already-assigned sprint.
			if (
				issue.sprintId &&
				issue.sprintId !== (sprintId as Id<"sprints">) &&
				!args.clearLegacyMilestoneLinks
			) {
				continue;
			}

			const patch: {
				sprintId?: Id<"sprints">;
				milestoneId?: Id<"milestones">;
				updatedAt?: number;
			} = {};
			let shouldPatch = false;
			if (!issue.sprintId) {
				patch.sprintId = sprintId as Id<"sprints">;
				shouldPatch = true;
			}
			if (args.clearLegacyMilestoneLinks) {
				patch.milestoneId = undefined;
				shouldPatch = true;
			}
			if (!shouldPatch) {
				continue;
			}

			patch.updatedAt = Date.now();
			await ctx.db.patch(issue._id, patch);
			updatedIssues += 1;
		}

		return {
			projectId: args.projectId,
			migratedMilestones,
			reusedSprints,
			updatedIssues,
		};
	},
});
