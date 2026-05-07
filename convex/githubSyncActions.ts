"use node";

/**
 * GitHub Sync Actions — Node.js runtime actions that call GitHub API.
 *
 * These actions decrypt tokens (requires Node.js crypto) and make HTTP
 * calls to the GitHub REST API, then delegate storage to internal
 * mutations in githubSync.ts.
 */

import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { decryptToken } from "./ai/indexing/githubUtils";

// ── Constants ────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_HEADERS = {
	Accept: "application/vnd.github+json",
	"X-GitHub-Api-Version": "2022-11-28",
};

// ── Function References ──────────────────────────────────────────────────

const getConnectionInternalRef = makeFunctionReference<
	"mutation",
	{ connectionId: Id<"githubConnections"> },
	{
		_id: Id<"githubConnections">;
		workspaceId: Id<"workspaces">;
		projectId: Id<"projects">;
		repoOwner: string;
		repoName: string;
		defaultBranch: string;
		accessToken: string;
		status: "active" | "disconnected" | "error";
		webhookId?: number;
		webhookSecret?: string;
	} | null
>("github:getConnectionInternal");

// ── Helpers ──────────────────────────────────────────────────────────────

function mapGithubStatusToClave(state: string, assignee: unknown): string {
	if (state === "closed") return "done";
	if (assignee) return "in_progress";
	return "todo";
}

function mapClaveStatusToGithub(status: string): "open" | "closed" {
	if (status === "done" || status === "cancelled") return "closed";
	return "open";
}

function mapClaveStatusToGithubLabels(status: string): string[] {
	switch (status) {
		case "cancelled":
			return ["cancelled"];
		case "triage":
			return ["triage"];
		case "backlog":
			return ["backlog"];
		default:
			return [];
	}
}

async function autoDetectLinkedIssue(
	// biome-ignore lint/suspicious/noExplicitAny: duck-typed action context
	ctx: { runQuery: (ref: any, args: any) => Promise<any> },
	workspaceId: Id<"workspaces">,
	branchName: string,
	title: string,
	body: string,
): Promise<Id<"issues"> | undefined> {
	const settings = await ctx.runQuery(
		internal.githubSync.getWorkspaceSettings,
		{ workspaceId },
	);
	if (!settings) return undefined;

	const prefix = settings.issuePrefix ?? settings.storyPrefix;
	if (!prefix) return undefined;

	const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`\\b${escapedPrefix}-(\\d{1,6})\\b`, "i");

	const sources = [branchName, title, body.slice(0, 2000)];
	for (const source of sources) {
		const match = source.match(pattern);
		if (match) {
			const identifier = `${prefix}-${match[1].padStart(3, "0")}`.toUpperCase();
			const issue = await ctx.runQuery(
				internal.githubSync.resolveIssueByIdentifier,
				{ workspaceId, identifier },
			);
			if (issue) return issue._id;
		}
	}

	return undefined;
}

// ══════════════════════════════════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════════════════════════════════

/** Full PR sync: fetch all open + recently closed PRs from GitHub API. */
export const syncPullRequestsFromGithub = internalAction({
	args: { connectionId: v.id("githubConnections") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubSync] Failed to decrypt token:", error);
			return null;
		}

		const { repoOwner, repoName, projectId, workspaceId } = connection;

		for (const state of ["open", "closed"] as const) {
			let page = 1;
			const perPage = 30;
			let hasMore = true;

			while (hasMore) {
				const url = `${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/pulls?state=${state}&per_page=${perPage}&page=${page}&sort=updated&direction=desc`;
				const resp = await fetch(url, {
					headers: {
						Authorization: `Bearer ${accessToken}`,
						...GITHUB_HEADERS,
					},
				});

				if (!resp.ok) {
					console.error(
						`[githubSync] PR fetch failed (${resp.status}): ${await resp.text()}`,
					);
					break;
				}

				const prs = await resp.json();
				if (!Array.isArray(prs) || prs.length === 0) break;

				for (const pr of prs) {
					const prState: "open" | "closed" | "merged" | "draft" = pr.merged_at
						? "merged"
						: pr.draft
							? "draft"
							: pr.state;

					const linkedIssueId = await autoDetectLinkedIssue(
						ctx,
						workspaceId,
						pr.head?.ref ?? "",
						pr.title ?? "",
						pr.body ?? "",
					);

					await ctx.runMutation(internal.githubSync.upsertPullRequest, {
						connectionId: args.connectionId,
						projectId,
						workspaceId,
						githubId: pr.id,
						number: pr.number,
						title: pr.title,
						body: pr.body ? pr.body.slice(0, 4000) : undefined,
						state: prState,
						authorLogin: pr.user?.login ?? "unknown",
						authorAvatarUrl: pr.user?.avatar_url,
						headBranch: pr.head?.ref ?? "",
						baseBranch: pr.base?.ref ?? "",
						htmlUrl: pr.html_url,
						isDraft: pr.draft ?? false,
						mergedAt: pr.merged_at
							? new Date(pr.merged_at).getTime()
							: undefined,
						closedAt: pr.closed_at
							? new Date(pr.closed_at).getTime()
							: undefined,
						reviewDecision: undefined,
						linkedIssueId,
						githubCreatedAt: new Date(pr.created_at).getTime(),
						githubUpdatedAt: new Date(pr.updated_at).getTime(),
					});
				}

				if (state === "closed" && page >= 3) break;
				hasMore = prs.length === perPage;
				page++;
			}
		}

		await ctx.runMutation(internal.githubSync.updateLastPrSync, {
			connectionId: args.connectionId,
		});
		console.log(`[githubSync] PR sync complete for ${repoOwner}/${repoName}`);
		return null;
	},
});

/** Fetch recent commits from the default branch. */
export const syncCommitsFromGithub = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		since: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubSync] Failed to decrypt token:", error);
			return null;
		}

		const { repoOwner, repoName, defaultBranch, projectId, workspaceId } =
			connection;

		let page = 1;
		const perPage = 30;
		let hasMore = true;

		while (hasMore && page <= 5) {
			let url = `${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/commits?sha=${defaultBranch}&per_page=${perPage}&page=${page}`;
			if (args.since) {
				url += `&since=${args.since}`;
			}

			const resp = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					...GITHUB_HEADERS,
				},
			});

			if (!resp.ok) {
				console.error(
					`[githubSync] Commit fetch failed (${resp.status}): ${await resp.text()}`,
				);
				break;
			}

			const commits = await resp.json();
			if (!Array.isArray(commits) || commits.length === 0) break;

			for (const commit of commits) {
				await ctx.runMutation(internal.githubSync.upsertCommit, {
					connectionId: args.connectionId,
					projectId,
					workspaceId,
					sha: commit.sha,
					message: commit.commit?.message ?? "",
					authorLogin:
						commit.author?.login ?? commit.commit?.author?.name ?? "unknown",
					authorEmail: commit.commit?.author?.email,
					authorAvatarUrl: commit.author?.avatar_url,
					htmlUrl: commit.html_url,
					committedAt: new Date(
						commit.commit?.author?.date ?? Date.now(),
					).getTime(),
				});
			}

			hasMore = commits.length === perPage;
			page++;
		}

		await ctx.runMutation(internal.githubSync.updateLastCommitSync, {
			connectionId: args.connectionId,
		});
		console.log(
			`[githubSync] Commit sync complete for ${repoOwner}/${repoName}`,
		);
		return null;
	},
});

/** Full GitHub issue sync: create/update Clave issues from GitHub issues. */
export const syncGithubIssues = internalAction({
	args: { connectionId: v.id("githubConnections") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubSync] Failed to decrypt token:", error);
			return null;
		}

		const { repoOwner, repoName, projectId, workspaceId } = connection;

		const fullConnection = await ctx.runQuery(
			internal.githubSync.getConnectionCreator,
			{ connectionId: args.connectionId },
		);
		if (!fullConnection) return null;
		const createdBy = fullConnection.createdBy;

		let page = 1;
		const perPage = 30;
		let hasMore = true;

		while (hasMore && page <= 10) {
			const url = `${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/issues?state=all&per_page=${perPage}&page=${page}&sort=updated&direction=desc`;
			const resp = await fetch(url, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					...GITHUB_HEADERS,
				},
			});

			if (!resp.ok) {
				console.error(
					`[githubSync] Issue fetch failed (${resp.status}): ${await resp.text()}`,
				);
				break;
			}

			const issues = await resp.json();
			if (!Array.isArray(issues) || issues.length === 0) break;

			for (const ghIssue of issues) {
				// Skip pull requests (GitHub API returns them in /issues)
				if (ghIssue.pull_request) continue;

				const existingSync = await ctx.runQuery(
					internal.githubSync.getIssueSyncByGithubId,
					{
						connectionId: args.connectionId,
						githubIssueId: ghIssue.id,
					},
				);

				if (existingSync) {
					// Timestamp guard
					if (existingSync.lastGithubUpdatedAt === ghIssue.updated_at) {
						continue;
					}

					// Conflict detection
					if (
						existingSync.lastClaveUpdatedAt &&
						existingSync.syncSource === "clave"
					) {
						await ctx.runMutation(internal.githubSync.upsertIssueSync, {
							connectionId: args.connectionId,
							projectId,
							workspaceId,
							githubIssueId: ghIssue.id,
							githubIssueNumber: ghIssue.number,
							githubIssueUrl: ghIssue.html_url,
							claveIssueId: existingSync.claveIssueId,
							lastGithubUpdatedAt: ghIssue.updated_at,
							syncSource: "github",
							syncStatus: "conflict",
						});
						continue;
					}

					// Update existing Clave issue
					const claveStatus = mapGithubStatusToClave(
						ghIssue.state,
						ghIssue.assignee,
					);
					await ctx.runMutation(internal.githubSync.updateIssueFromGithub, {
						issueId: existingSync.claveIssueId,
						title: ghIssue.title,
						description: ghIssue.body ?? undefined,
						status: claveStatus,
					});

					await ctx.runMutation(internal.githubSync.upsertIssueSync, {
						connectionId: args.connectionId,
						projectId,
						workspaceId,
						githubIssueId: ghIssue.id,
						githubIssueNumber: ghIssue.number,
						githubIssueUrl: ghIssue.html_url,
						claveIssueId: existingSync.claveIssueId,
						lastGithubUpdatedAt: ghIssue.updated_at,
						syncSource: "github",
						syncStatus: "synced",
					});
				} else {
					// Create new Clave issue
					const claveStatus = mapGithubStatusToClave(
						ghIssue.state,
						ghIssue.assignee,
					);
					const result = await ctx.runMutation(
						internal.githubSync.createIssueFromGithub,
						{
							workspaceId,
							projectId,
							title: ghIssue.title,
							description: ghIssue.body ?? undefined,
							status: claveStatus,
							createdBy,
						},
					);

					await ctx.runMutation(internal.githubSync.upsertIssueSync, {
						connectionId: args.connectionId,
						projectId,
						workspaceId,
						githubIssueId: ghIssue.id,
						githubIssueNumber: ghIssue.number,
						githubIssueUrl: ghIssue.html_url,
						claveIssueId: result.issueId,
						lastGithubUpdatedAt: ghIssue.updated_at,
						syncSource: "initial",
						syncStatus: "synced",
					});
				}
			}

			hasMore = issues.length === perPage;
			page++;
		}

		await ctx.runMutation(internal.githubSync.updateLastIssueSync, {
			connectionId: args.connectionId,
		});
		console.log(
			`[githubSync] Issue sync complete for ${repoOwner}/${repoName}`,
		);
		return null;
	},
});

/** Push Clave issue changes to GitHub (outbound sync). */
export const pushIssueToGithub = internalAction({
	args: { syncRecordId: v.id("githubIssueSync") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const syncRecord = await ctx.runQuery(
			internal.githubSync.getSyncRecordById,
			{ syncRecordId: args.syncRecordId },
		);
		if (!syncRecord) return null;

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: syncRecord.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubSync] Failed to decrypt token:", error);
			return null;
		}

		const issue = await ctx.runQuery(internal.githubSync.getIssueById, {
			issueId: syncRecord.claveIssueId,
		});
		if (!issue) return null;

		const { repoOwner, repoName } = connection;
		const ghState = mapClaveStatusToGithub(issue.status);
		const labels = mapClaveStatusToGithubLabels(issue.status);

		try {
			const resp = await fetch(
				`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/issues/${syncRecord.githubIssueNumber}`,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						...GITHUB_HEADERS,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						title: issue.title,
						body: issue.description ?? "",
						state: ghState,
						labels,
					}),
				},
			);

			if (!resp.ok) {
				const errorText = await resp.text();
				console.error(
					`[githubSync] Push to GitHub failed (${resp.status}): ${errorText}`,
				);
				await ctx.runMutation(internal.githubSync.upsertIssueSync, {
					connectionId: syncRecord.connectionId,
					projectId: syncRecord.projectId,
					workspaceId: syncRecord.workspaceId,
					githubIssueId: syncRecord.githubIssueId,
					githubIssueNumber: syncRecord.githubIssueNumber,
					githubIssueUrl: syncRecord.githubIssueUrl,
					claveIssueId: syncRecord.claveIssueId,
					syncSource: "clave",
					syncStatus: "error",
					errorMessage: `GitHub API ${resp.status}: ${errorText.slice(0, 200)}`,
				});
				return null;
			}

			const updated = await resp.json();
			await ctx.runMutation(internal.githubSync.upsertIssueSync, {
				connectionId: syncRecord.connectionId,
				projectId: syncRecord.projectId,
				workspaceId: syncRecord.workspaceId,
				githubIssueId: syncRecord.githubIssueId,
				githubIssueNumber: syncRecord.githubIssueNumber,
				githubIssueUrl: syncRecord.githubIssueUrl,
				claveIssueId: syncRecord.claveIssueId,
				lastGithubUpdatedAt: updated.updated_at,
				lastClaveUpdatedAt: Date.now(),
				syncSource: "clave",
				syncStatus: "synced",
			});

			console.log(
				`[githubSync] Pushed issue ${issue.identifier} to GitHub #${syncRecord.githubIssueNumber}`,
			);
		} catch (error) {
			console.error("[githubSync] Error pushing to GitHub:", error);
		}

		return null;
	},
});

/** Periodic sync cron handler — schedules syncs for active connections. */
export const periodicSync = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const connections = await ctx.runQuery(
			internal.githubSync.getActiveConnectionsForSync,
			{},
		);

		for (const connection of connections) {
			if (connection.prSyncEnabled !== false) {
				await ctx.scheduler.runAfter(
					0,
					internal.githubSyncActions.syncPullRequestsFromGithub,
					{ connectionId: connection._id },
				);
			}
			if (connection.commitSyncEnabled !== false) {
				await ctx.scheduler.runAfter(
					0,
					internal.githubSyncActions.syncCommitsFromGithub,
					{ connectionId: connection._id },
				);
			}
			if (connection.issueSyncEnabled) {
				await ctx.scheduler.runAfter(
					0,
					internal.githubSyncActions.syncGithubIssues,
					{ connectionId: connection._id },
				);
			}
		}

		return null;
	},
});

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC ACTIONS — called from the client
// ══════════════════════════════════════════════════════════════════════════

/** List branches for a connected GitHub repository. */
export const listBranches = action({
	args: { connectionId: v.id("githubConnections") },
	returns: v.array(v.object({ name: v.string(), isDefault: v.boolean() })),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") {
			throw new Error("Connection not found or inactive");
		}

		const accessToken = await decryptToken(connection.accessToken);
		const { repoOwner, repoName, defaultBranch: storedDefault } = connection;

		// Two parallel requests:
		//  1) /branches — full branch list for the picker
		//  2) /repos/{owner}/{name} — the *live* default branch
		// Computing `isDefault` against the stored copy alone made the auto-
		// selection fail whenever the stored value was stale (default
		// branch renamed on GitHub, e.g. master → main) or never populated.
		// Falling back to the live value makes the picker self-heal.
		const [branchesResp, repoResp] = await Promise.all([
			fetch(
				`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/branches?per_page=100`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						...GITHUB_HEADERS,
					},
				},
			),
			fetch(`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}`, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					...GITHUB_HEADERS,
				},
			}),
		]);

		if (!branchesResp.ok) {
			const errorText = await branchesResp.text();
			throw new Error(`GitHub API ${branchesResp.status}: ${errorText}`);
		}

		// `default_branch` is on the live repo payload. If the repo lookup
		// fails for any reason we fall back to the stored value rather than
		// failing the whole dialog.
		let liveDefault: string | null = null;
		if (repoResp.ok) {
			try {
				const repoData = (await repoResp.json()) as {
					default_branch?: string;
				};
				if (typeof repoData.default_branch === "string") {
					liveDefault = repoData.default_branch;
				}
			} catch {
				// fall through to stored
			}
		}
		const effectiveDefault = liveDefault ?? storedDefault;

		const branches: Array<{ name: string }> = await branchesResp.json();
		const result = branches.map((b) => ({
			name: b.name,
			isDefault: b.name === effectiveDefault,
		}));
		console.log(
			`[listBranches] Returning ${result.length} branches for ${repoOwner}/${repoName} (default=${effectiveDefault})`,
		);
		return result;
	},
});

/** Create a branch on a connected GitHub repository. */
export const createBranch = action({
	args: {
		connectionId: v.id("githubConnections"),
		branchName: v.string(),
		baseBranch: v.string(),
	},
	returns: v.object({
		success: v.boolean(),
		error: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Not authenticated");

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") {
			return { success: false, error: "Connection not found or inactive" };
		}

		const accessToken = await decryptToken(connection.accessToken);
		const { repoOwner, repoName } = connection;

		// Get the SHA of the base branch
		const refResp = await fetch(
			`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/git/refs/heads/${args.baseBranch}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					...GITHUB_HEADERS,
				},
			},
		);

		if (!refResp.ok) {
			const errorText = await refResp.text();
			return {
				success: false,
				error: `Failed to resolve base branch: ${errorText}`,
			};
		}

		const refData: { object: { sha: string } } = await refResp.json();
		const sha = refData.object.sha;

		// Create the new branch
		const createResp = await fetch(
			`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/git/refs`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					...GITHUB_HEADERS,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					ref: `refs/heads/${args.branchName}`,
					sha,
				}),
			},
		);

		if (!createResp.ok) {
			const errorText = await createResp.text();
			if (createResp.status === 422) {
				return { success: false, error: "Branch already exists" };
			}
			if (createResp.status === 403) {
				return {
					success: false,
					error:
						"Permission denied — your token needs the 'repo' scope to create branches. Re-generate it at github.com/settings/tokens.",
				};
			}
			return {
				success: false,
				error: `GitHub API ${createResp.status}: ${errorText}`,
			};
		}

		console.log(
			`[createBranch] Branch "${args.branchName}" created from "${args.baseBranch}" on ${repoOwner}/${repoName}`,
		);
		return { success: true };
	},
});
