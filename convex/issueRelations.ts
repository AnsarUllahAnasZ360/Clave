import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import { requireWorkspaceMember } from "./lib/auth";
import { createNotification } from "./lib/notifications";

// ── Shared Validators ──────────────────────────────────────────────────────

const relationTypeValidator = v.union(
	v.literal("blocks"),
	v.literal("blocked_by"),
	v.literal("relates_to"),
	v.literal("duplicate"),
);

// ── Helpers ────────────────────────────────────────────────────────────────

type RelationType = "blocks" | "blocked_by" | "relates_to" | "duplicate";

/** Get the inverse type for a relation. Returns null for duplicate (no inverse). */
function getInverseType(type: RelationType): RelationType | null {
	switch (type) {
		case "blocks":
			return "blocked_by";
		case "blocked_by":
			return "blocks";
		case "relates_to":
			return "relates_to";
		case "duplicate":
			return null;
	}
}

// ── Queries (2) ────────────────────────────────────────────────────────────

/** All relations for an issue (both sides), with related issue details, grouped by type */
export const listByIssue = query({
	args: {
		issueId: v.id("issues"),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			return { blocks: [], blocked_by: [], relates_to: [], duplicate: [] };
		}
		await requireWorkspaceMember(ctx, issue.workspaceId);

		// Query from both sides of the relation
		const asSource = await ctx.db
			.query("issueRelations")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.collect();

		const asTarget = await ctx.db
			.query("issueRelations")
			.withIndex("by_related_issue", (q) =>
				q.eq("relatedIssueId", args.issueId),
			)
			.collect();

		// Build deduplicated relations from this issue's perspective
		const seen = new Set<string>();
		type RelationEntry = {
			_id: (typeof asSource)[0]["_id"];
			type: RelationType;
			otherIssueId: typeof issue._id;
			createdAt: number;
		};
		const relations: RelationEntry[] = [];

		// Source side: this issue is issueId, related issue is relatedIssueId
		for (const rel of asSource) {
			const key = `${rel.relatedIssueId}:${rel.type}`;
			if (!seen.has(key)) {
				seen.add(key);
				relations.push({
					_id: rel._id,
					type: rel.type as RelationType,
					otherIssueId: rel.relatedIssueId,
					createdAt: rel.createdAt,
				});
			}
		}

		// Target side: this issue is relatedIssueId, flip the type for correct perspective
		for (const rel of asTarget) {
			const rawType = rel.type as RelationType;
			const flipped = getInverseType(rawType);
			const perspectiveType = flipped ?? rawType;
			const key = `${rel.issueId}:${perspectiveType}`;
			if (!seen.has(key)) {
				seen.add(key);
				relations.push({
					_id: rel._id,
					type: perspectiveType,
					otherIssueId: rel.issueId,
					createdAt: rel.createdAt,
				});
			}
		}

		// Join with issues table and group by type
		type RelationWithIssue = {
			_id: (typeof asSource)[0]["_id"];
			type: RelationType;
			relatedIssue: {
				_id: typeof issue._id;
				identifier: string;
				title: string;
				status: string;
				priority: string;
			};
			createdAt: number;
		};

		const grouped: Record<RelationType, RelationWithIssue[]> = {
			blocks: [],
			blocked_by: [],
			relates_to: [],
			duplicate: [],
		};

		for (const rel of relations) {
			const otherIssue = await ctx.db.get(rel.otherIssueId);
			if (!otherIssue || otherIssue.deletedAt) continue;

			grouped[rel.type].push({
				_id: rel._id,
				type: rel.type,
				relatedIssue: {
					_id: otherIssue._id,
					identifier: otherIssue.identifier,
					title: otherIssue.title,
					status: otherIssue.status,
					priority: otherIssue.priority,
				},
				createdAt: rel.createdAt,
			});
		}

		return grouped;
	},
});

/** Issues blocking a given issue (convenience for quick blocking checks) */
export const getBlockers = query({
	args: {
		issueId: v.id("issues"),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return [];
		await requireWorkspaceMember(ctx, issue.workspaceId);

		// blocked_by relations where this issue is the source mean "this issue is blocked by X"
		const blockedByRelations = await ctx.db
			.query("issueRelations")
			.withIndex("by_issue_type", (q) =>
				q.eq("issueId", args.issueId).eq("type", "blocked_by"),
			)
			.collect();

		const blockers = [];
		for (const rel of blockedByRelations) {
			const blocker = await ctx.db.get(rel.relatedIssueId);
			if (blocker && !blocker.deletedAt) {
				blockers.push({
					_id: blocker._id,
					identifier: blocker.identifier,
					title: blocker.title,
					status: blocker.status,
					priority: blocker.priority,
				});
			}
		}

		return blockers;
	},
});

// ── Mutations (3) ──────────────────────────────────────────────────────────

/** Create a relation with automatic inverse creation and duplicate handling */
export const create = mutation({
	args: {
		issueId: v.id("issues"),
		relatedIssueId: v.id("issues"),
		type: relationTypeValidator,
	},
	handler: async (ctx, args) => {
		// No self-reference
		if (args.issueId === args.relatedIssueId) {
			throw new ConvexError(
				"Cannot create a relation between an issue and itself",
			);
		}

		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Source issue not found");
		}

		const relatedIssue = await ctx.db.get(args.relatedIssueId);
		if (!relatedIssue || relatedIssue.deletedAt) {
			throw new ConvexError("Related issue not found");
		}

		// Same workspace
		if (issue.workspaceId !== relatedIssue.workspaceId) {
			throw new ConvexError("Both issues must be in the same workspace");
		}

		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		const type = args.type as RelationType;
		const inverseType = getInverseType(type);

		// Duplicate detection: check forward direction (issueId -> relatedIssueId, same type)
		const forwardRelations = await ctx.db
			.query("issueRelations")
			.withIndex("by_issue_type", (q) =>
				q.eq("issueId", args.issueId).eq("type", type),
			)
			.collect();

		if (
			forwardRelations.some((r) => r.relatedIssueId === args.relatedIssueId)
		) {
			throw new ConvexError("This relation already exists");
		}

		// Duplicate detection: check inverse direction (relatedIssueId -> issueId, inverse type)
		if (inverseType) {
			const inverseRelations = await ctx.db
				.query("issueRelations")
				.withIndex("by_issue_type", (q) =>
					q.eq("issueId", args.relatedIssueId).eq("type", inverseType),
				)
				.collect();

			if (inverseRelations.some((r) => r.relatedIssueId === args.issueId)) {
				throw new ConvexError("This relation already exists");
			}
		}

		// For duplicate: also check reverse direction (relatedIssueId -> issueId as duplicate)
		if (type === "duplicate") {
			const reverseDuplicates = await ctx.db
				.query("issueRelations")
				.withIndex("by_issue_type", (q) =>
					q.eq("issueId", args.relatedIssueId).eq("type", "duplicate"),
				)
				.collect();

			if (reverseDuplicates.some((r) => r.relatedIssueId === args.issueId)) {
				throw new ConvexError(
					"A duplicate relation already exists between these issues",
				);
			}
		}

		const now = Date.now();

		// Create the relation
		const relationId = await ctx.db.insert("issueRelations", {
			issueId: args.issueId,
			relatedIssueId: args.relatedIssueId,
			type,
			createdBy: userId,
			createdAt: now,
		});

		// Create inverse relation (blocks <-> blocked_by, relates_to <-> relates_to)
		// Duplicate has no inverse
		if (inverseType) {
			await ctx.db.insert("issueRelations", {
				issueId: args.relatedIssueId,
				relatedIssueId: args.issueId,
				type: inverseType,
				createdBy: userId,
				createdAt: now,
			});
		}

		// Handle duplicate: cancel the source issue and notify assignee
		if (type === "duplicate") {
			await ctx.db.patch(args.issueId, {
				status: "cancelled",
				completedAt: now,
				updatedAt: now,
			});

			if (issue.assigneeId) {
				const actor = await ctx.db.get(userId);
				const actorName = actor?.name ?? "Someone";
				await createNotification(ctx, {
					userId: issue.assigneeId,
					workspaceId: issue.workspaceId,
					type: "issue_status_changed",
					title: "Issue marked as duplicate",
					body: `${actorName} marked '${issue.identifier}: ${issue.title}' as a duplicate of '${relatedIssue.identifier}: ${relatedIssue.title}'`,
					issueId: args.issueId,
					projectId: issue.projectId ?? undefined,
					actorId: userId,
				});
			}
		}

		// Log activity on source issue
		const typeLabel = type.replace(/_/g, " ");
		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: args.issueId,
			action: "relation_created",
			actorId: userId,
			description: `added ${typeLabel} relation to ${relatedIssue.identifier}`,
			issueId: args.issueId,
			projectId: issue.projectId,
		});

		// Log activity on related issue
		const inverseLabel = inverseType
			? inverseType.replace(/_/g, " ")
			: typeLabel;
		await logActivity(ctx, {
			workspaceId: relatedIssue.workspaceId,
			entityType: "issue",
			entityId: args.relatedIssueId,
			action: "relation_created",
			actorId: userId,
			description: `${issue.identifier} added as ${inverseLabel}`,
			issueId: args.relatedIssueId,
			projectId: relatedIssue.projectId,
		});

		return relationId;
	},
});

/** Delete a relation by ID and its inverse */
export const remove = mutation({
	args: {
		relationId: v.id("issueRelations"),
	},
	handler: async (ctx, args) => {
		const relation = await ctx.db.get(args.relationId);
		if (!relation) {
			throw new ConvexError("Relation not found");
		}

		const issue = await ctx.db.get(relation.issueId);
		if (!issue) {
			throw new ConvexError("Issue not found");
		}

		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		const type = relation.type as RelationType;
		const inverseType = getInverseType(type);

		// Delete the relation
		await ctx.db.delete(args.relationId);

		// Find and delete the inverse
		if (inverseType) {
			const inverseRelations = await ctx.db
				.query("issueRelations")
				.withIndex("by_issue_type", (q) =>
					q.eq("issueId", relation.relatedIssueId).eq("type", inverseType),
				)
				.collect();

			const inverse = inverseRelations.find(
				(r) => r.relatedIssueId === relation.issueId,
			);
			if (inverse) {
				await ctx.db.delete(inverse._id);
			}
		}

		// Log activity on source issue
		const relatedIssue = await ctx.db.get(relation.relatedIssueId);
		const relatedIdentifier = relatedIssue?.identifier ?? "unknown";
		const typeLabel = type.replace(/_/g, " ");

		await logActivity(ctx, {
			workspaceId: issue.workspaceId,
			entityType: "issue",
			entityId: relation.issueId,
			action: "relation_removed",
			actorId: userId,
			description: `removed ${typeLabel} relation to ${relatedIdentifier}`,
			issueId: relation.issueId,
			projectId: issue.projectId,
		});

		// Log activity on related issue
		if (relatedIssue && !relatedIssue.deletedAt) {
			const inverseLabel = inverseType
				? inverseType.replace(/_/g, " ")
				: typeLabel;
			await logActivity(ctx, {
				workspaceId: relatedIssue.workspaceId,
				entityType: "issue",
				entityId: relation.relatedIssueId,
				action: "relation_removed",
				actorId: userId,
				description: `${issue.identifier} removed as ${inverseLabel}`,
				issueId: relation.relatedIssueId,
				projectId: relatedIssue.projectId,
			});
		}
	},
});

/** Delete relations between two specific issues (by pair) and their inverses */
export const removeByIssues = mutation({
	args: {
		issueId: v.id("issues"),
		relatedIssueId: v.id("issues"),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) {
			throw new ConvexError("Issue not found");
		}

		const { userId } = await requireWorkspaceMember(ctx, issue.workspaceId);

		// Find all relations from issueId to relatedIssueId
		const relations = await ctx.db
			.query("issueRelations")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.collect();

		const matching = relations.filter(
			(r) => r.relatedIssueId === args.relatedIssueId,
		);

		if (matching.length === 0) {
			throw new ConvexError("No relation found between these issues");
		}

		const relatedIssue = await ctx.db.get(args.relatedIssueId);
		const relatedIdentifier = relatedIssue?.identifier ?? "unknown";

		for (const relation of matching) {
			const type = relation.type as RelationType;
			const inverseType = getInverseType(type);

			// Delete the relation
			await ctx.db.delete(relation._id);

			// Find and delete the inverse
			if (inverseType) {
				const inverseRelations = await ctx.db
					.query("issueRelations")
					.withIndex("by_issue_type", (q) =>
						q.eq("issueId", args.relatedIssueId).eq("type", inverseType),
					)
					.collect();

				const inverse = inverseRelations.find(
					(r) => r.relatedIssueId === args.issueId,
				);
				if (inverse) {
					await ctx.db.delete(inverse._id);
				}
			}

			// Log activity on source issue
			const typeLabel = type.replace(/_/g, " ");
			await logActivity(ctx, {
				workspaceId: issue.workspaceId,
				entityType: "issue",
				entityId: args.issueId,
				action: "relation_removed",
				actorId: userId,
				description: `removed ${typeLabel} relation to ${relatedIdentifier}`,
				issueId: args.issueId,
				projectId: issue.projectId,
			});

			// Log activity on related issue
			if (relatedIssue && !relatedIssue.deletedAt) {
				const inverseLabel = inverseType
					? inverseType.replace(/_/g, " ")
					: typeLabel;
				await logActivity(ctx, {
					workspaceId: relatedIssue.workspaceId,
					entityType: "issue",
					entityId: args.relatedIssueId,
					action: "relation_removed",
					actorId: userId,
					description: `${issue.identifier} removed as ${inverseLabel}`,
					issueId: args.relatedIssueId,
					projectId: relatedIssue.projectId,
				});
			}
		}
	},
});
