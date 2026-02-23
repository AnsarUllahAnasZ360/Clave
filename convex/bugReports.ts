import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";

// ── Auth helper ─────────────────────────────────────────────────────────

export const _getAuthUserId = internalQuery({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		return userId;
	},
});

// ── Rate limit check ────────────────────────────────────────────────────

export const _recentReportCount = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const oneHourAgo = Date.now() - 60 * 60 * 1000;
		const reports = await ctx.db
			.query("bugReports")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.filter((q) => q.gte(q.field("_creationTime"), oneHourAgo))
			.collect();
		return reports.length;
	},
});

// ── Log report (for rate limiting tracking + fallback) ──────────────────

export const _logReport = internalMutation({
	args: {
		userId: v.id("users"),
		title: v.string(),
		description: v.string(),
		steps: v.optional(v.string()),
		severity: v.optional(v.string()),
		issueUrl: v.optional(v.string()),
		issueNumber: v.optional(v.number()),
		status: v.union(v.literal("created"), v.literal("failed")),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("bugReports", {
			userId: args.userId,
			title: args.title,
			description: args.description,
			steps: args.steps,
			severity: args.severity,
			issueUrl: args.issueUrl,
			issueNumber: args.issueNumber,
			status: args.status,
		});
	},
});

// ── Submit bug report action ────────────────────────────────────────────

export const submit = action({
	args: {
		title: v.string(),
		description: v.string(),
		steps: v.optional(v.string()),
		severity: v.optional(v.string()),
	},
	returns: v.object({
		issueUrl: v.string(),
		issueNumber: v.number(),
	}),
	handler: async (ctx, args) => {
		// Auth check (delegated to query context for getAuthUserId)
		const userId = await ctx.runQuery(internal.bugReports._getAuthUserId);

		// Validate input
		const title = args.title.trim();
		const description = args.description.trim();
		if (!title || title.length > 200) {
			throw new ConvexError(
				"Title is required and must be under 200 characters",
			);
		}
		if (!description || description.length > 5000) {
			throw new ConvexError(
				"Description is required and must be under 5000 characters",
			);
		}

		// Rate limit: max 5 per hour
		const recentCount = await ctx.runQuery(
			internal.bugReports._recentReportCount,
			{ userId },
		);
		if (recentCount >= 5) {
			throw new ConvexError(
				"Rate limit reached. You can submit up to 5 bug reports per hour.",
			);
		}

		// Check GitHub configuration
		const token = process.env.GITHUB_BUG_REPORT_TOKEN;
		const owner = process.env.GITHUB_REPO_OWNER;
		const repo = process.env.GITHUB_REPO_NAME;
		const assignee = process.env.GITHUB_ISSUE_ASSIGNEE;

		if (!token || !owner || !repo) {
			// Fallback: store locally without creating GitHub issue
			await ctx.runMutation(internal.bugReports._logReport, {
				userId,
				title,
				description,
				steps: args.steps,
				severity: args.severity,
				status: "failed",
			});
			throw new ConvexError(
				"Bug reporting is not configured. Your report has been saved for manual review.",
			);
		}

		// Get user info for the report
		const identity = await ctx.auth.getUserIdentity();
		const reporterName = identity?.name ?? "Unknown user";
		const reporterEmail = identity?.email ?? "";

		// Build GitHub issue body
		const severityLabel = args.severity
			? `**Severity:** ${args.severity}\n`
			: "";
		const stepsSection = args.steps
			? `\n## Steps to Reproduce\n${args.steps}\n`
			: "";

		const body = `## Bug Report

**Reporter:** ${reporterName}${reporterEmail ? ` (${reporterEmail})` : ""}
${severityLabel}
## Description
${description}
${stepsSection}
---
*Submitted via Millhouse bug report dialog*`;

		// Assign labels based on severity
		const labels = ["bug"];
		if (args.severity === "critical") labels.push("priority: critical");
		else if (args.severity === "high") labels.push("priority: high");

		// Create GitHub issue
		const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues`;
		const issuePayload: Record<string, unknown> = {
			title,
			body,
			labels,
		};
		if (assignee) {
			issuePayload.assignees = [assignee];
		}

		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: "application/vnd.github+json",
				"Content-Type": "application/json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			body: JSON.stringify(issuePayload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("GitHub API error:", response.status, errorText);

			// Store locally as fallback
			await ctx.runMutation(internal.bugReports._logReport, {
				userId,
				title,
				description,
				steps: args.steps,
				severity: args.severity,
				status: "failed",
			});

			if (response.status === 401 || response.status === 403) {
				throw new ConvexError(
					"GitHub authentication failed. Please contact the administrator.",
				);
			}
			throw new ConvexError(
				"Failed to create GitHub issue. Your report has been saved for manual review.",
			);
		}

		const issue = (await response.json()) as {
			html_url: string;
			number: number;
		};

		// Log successful report
		await ctx.runMutation(internal.bugReports._logReport, {
			userId,
			title,
			description,
			steps: args.steps,
			severity: args.severity,
			issueUrl: issue.html_url,
			issueNumber: issue.number,
			status: "created",
		});

		return {
			issueUrl: issue.html_url,
			issueNumber: issue.number,
		};
	},
});
