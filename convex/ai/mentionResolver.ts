"use node";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

// ── Types ─────────────────────────────────────────────────────────────────

export interface MentionReferenceData {
	entityType: "user" | "issue" | "document";
	entityId: string;
	displayName: string;
}

export interface ResolvedMention extends MentionReferenceData {
	contextSummary: string;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Max characters per resolved mention to stay within ~200 token budget */
const MAX_CHARS_PER_MENTION = 800;

const PRIORITY_ORDER: Record<string, number> = {
	urgent: 0,
	high: 1,
	medium: 2,
	low: 3,
	none: 4,
};

const ACTIVE_STATUSES = new Set([
	"backlog",
	"todo",
	"in_progress",
	"in_review",
]);

// ── Resolution Helpers ────────────────────────────────────────────────────

async function resolveUser(
	ctx: ActionCtx,
	workspaceId: Id<"workspaces">,
	entityId: string,
): Promise<string | null> {
	try {
		const user = await ctx.runQuery(api.users.getById, {
			userId: entityId as Id<"users">,
		});
		if (!user) return null;

		const name = user.name ?? "Unknown";
		const role = user.role ?? "Member";

		// Fetch their open issues
		let issuesSummary = "";
		try {
			const issues = await ctx.runQuery(api.issues.listByAssignee, {
				workspaceId,
				assigneeId: entityId as Id<"users">,
			});

			const activeIssues = issues
				.filter((i: { status: string }) => ACTIVE_STATUSES.has(i.status))
				.sort(
					(a: { priority?: string }, b: { priority?: string }) =>
						(PRIORITY_ORDER[a.priority ?? "none"] ?? 4) -
						(PRIORITY_ORDER[b.priority ?? "none"] ?? 4),
				)
				.slice(0, 5);

			if (activeIssues.length > 0) {
				const total = issues.filter((i: { status: string }) =>
					ACTIVE_STATUSES.has(i.status),
				).length;
				const issueList = activeIssues
					.map(
						(i: { identifier: string; priority?: string }) =>
							`${i.identifier} (${i.priority})`,
					)
					.join(", ");
				issuesSummary = `\n  Open issues (${total} total): ${issueList}`;
			} else {
				issuesSummary = "\n  No open issues";
			}
		} catch {
			// Non-critical: skip issues if query fails
		}

		return truncate(
			`@${name} (User, ${role}):${issuesSummary}`,
			MAX_CHARS_PER_MENTION,
		);
	} catch {
		return null;
	}
}

async function resolveIssue(
	ctx: ActionCtx,
	entityId: string,
): Promise<string | null> {
	try {
		const issue = await ctx.runQuery(api.issues.getById, {
			issueId: entityId as Id<"issues">,
		});
		if (!issue) return null;

		const description = issue.description
			? truncate(issue.description, 300)
			: "No description";

		// Fetch assignee name if assigned
		let assigneeName = "Unassigned";
		if (issue.assigneeId) {
			try {
				const assignee = await ctx.runQuery(api.users.getById, {
					userId: issue.assigneeId,
				});
				if (assignee?.name) assigneeName = assignee.name;
			} catch {
				// Non-critical
			}
		}

		// Fetch latest comment
		let latestComment = "";
		try {
			const comments = await ctx.runQuery(api.comments.listByIssue, {
				issueId: entityId as Id<"issues">,
			});
			if (comments.length > 0) {
				const last = comments[comments.length - 1];
				const authorName = last.author?.name ?? "Unknown";
				const commentText = truncate(last.body?.replace(/\n/g, " ") ?? "", 100);
				if (commentText) {
					latestComment = `\n  Latest comment: "${commentText}" — ${authorName}`;
				}
			}
		} catch {
			// Non-critical: skip comments if query fails
		}

		const dueDateStr = issue.dueDate
			? `\n  Due: ${new Date(issue.dueDate).toLocaleDateString()}`
			: "";

		return truncate(
			`@${issue.identifier} — ${issue.title} (Issue):\n  Status: ${issue.status} | Priority: ${issue.priority} | Assignee: ${assigneeName}\n  Description: ${description}${dueDateStr}${latestComment}`,
			MAX_CHARS_PER_MENTION,
		);
	} catch {
		return null;
	}
}

async function resolveDocument(
	ctx: ActionCtx,
	entityId: string,
): Promise<string | null> {
	try {
		const doc = await ctx.runQuery(api.documents.getById, {
			documentId: entityId as Id<"documents">,
		});
		if (!doc) return null;

		const contentPreview = doc.content
			? truncate(doc.content.replace(/\n+/g, " "), 500)
			: "No content";

		return truncate(
			`@${doc.title} (Document):\n  ${contentPreview}`,
			MAX_CHARS_PER_MENTION,
		);
	} catch {
		return null;
	}
}

// ── Main Resolution Function ──────────────────────────────────────────────

export async function resolveMentions(
	ctx: ActionCtx,
	workspaceId: Id<"workspaces">,
	mentions: MentionReferenceData[],
): Promise<ResolvedMention[]> {
	if (mentions.length === 0) return [];

	// Resolve all mentions in parallel
	const results = await Promise.all(
		mentions.map(async (mention): Promise<ResolvedMention> => {
			let contextSummary: string | null = null;

			switch (mention.entityType) {
				case "user":
					contextSummary = await resolveUser(
						ctx,
						workspaceId,
						mention.entityId,
					);
					break;
				case "issue":
					contextSummary = await resolveIssue(ctx, mention.entityId);
					break;
				case "document":
					contextSummary = await resolveDocument(ctx, mention.entityId);
					break;
			}

			// Graceful fallback for unresolvable entities
			if (!contextSummary) {
				contextSummary = `@${mention.displayName}: [Not found — may have been deleted]`;
			}

			return {
				...mention,
				contextSummary,
			};
		}),
	);

	return results;
}

// ── Context Block Builder ─────────────────────────────────────────────────

export function buildMentionContextBlock(resolved: ResolvedMention[]): string {
	if (resolved.length === 0) return "";

	const entries = resolved.map((m) => m.contextSummary).join("\n\n");

	return `\n\n--- Referenced Entities ---\n${entries}\n--------------------------\nThe user has explicitly referenced the above entities. Use their details to inform your response.`;
}

// ── Utilities ─────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}
