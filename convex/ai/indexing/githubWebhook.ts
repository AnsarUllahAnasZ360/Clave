"use node";

/**
 * GitHub Webhook Handler — Registration, verification, and incremental sync.
 *
 * Handles the full webhook lifecycle:
 * - registerWebhook: Registers a GitHub webhook after OAuth connection
 * - deregisterWebhook: Removes the webhook when a repo is disconnected
 * - handleWebhook: Public action that verifies HMAC signatures and dispatches
 * - processWebhookPush: Processes push events for incremental file indexing
 *
 * Architecture: The Next.js API route at /api/webhooks/github calls
 * handleWebhook (public action) with the raw body and headers. All
 * signature verification and processing happens server-side in Convex.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { action, internalAction } from "../../_generated/server";
import { getCodeNamespace, getRag } from "../rag";
import {
	type CodeChunk,
	chunkCodeFile,
	decryptToken,
	detectLanguage,
	shouldIndexFile,
} from "./githubUtils";

// Function references for github.ts (not yet in generated types)
const updateWebhookIdRef = makeFunctionReference<
	"mutation",
	{
		connectionId: Id<"githubConnections">;
		webhookId: number;
		webhookSecret: string;
	},
	null
>("github:updateWebhookId");

const updateLastSyncRef = makeFunctionReference<
	"mutation",
	{ connectionId: Id<"githubConnections"> },
	null
>("github:updateLastSync");

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

// ── Constants ────────────────────────────────────────────────────────────

const GITHUB_API_BASE = "https://api.github.com";
const WEBHOOK_BATCH_SIZE = 10;
const WEBHOOK_BATCH_DELAY_MS = 100;

// ── Types ────────────────────────────────────────────────────────────────

interface PushCommit {
	id: string;
	added: string[];
	modified: string[];
	removed: string[];
}

interface PushPayload {
	ref: string;
	commits: PushCommit[];
	repository: {
		full_name: string;
		default_branch: string;
	};
}

interface HandleWebhookArgs {
	rawBody: string;
	signature: string;
	event: string;
	deliveryId: string;
}

interface HandleWebhookResult {
	status: string;
	message?: string;
}

// ── Register Webhook ─────────────────────────────────────────────────────

/**
 * Register a GitHub webhook for a connected repository.
 * Called after initial indexing to enable incremental sync via push events.
 *
 * Generates a per-connection webhook secret, registers the webhook with
 * GitHub's API, and stores the webhook ID and secret for later verification.
 */
export const registerWebhook = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Fetch connection details
		const connection = await ctx.runQuery(
			internal.ai.indexing.queries.getGithubConnection,
			{ projectId: args.projectId },
		);

		if (!connection) {
			console.warn(
				`[githubWebhook] No active connection for project ${args.projectId}`,
			);
			return null;
		}

		// Decrypt the access token
		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubWebhook] Failed to decrypt access token:", error);
			return null;
		}

		// Generate a random webhook secret (32-byte hex)
		const webhookSecret = randomBytes(32).toString("hex");

		// Determine the app URL for the webhook callback
		const appUrl = process.env.APP_URL;
		if (!appUrl) {
			console.error(
				"[githubWebhook] APP_URL environment variable is required for webhook registration",
			);
			return null;
		}

		const webhookUrl = `${appUrl}/api/webhooks/github`;

		// Register webhook with GitHub API
		try {
			const resp = await fetch(
				`${GITHUB_API_BASE}/repos/${connection.repoOwner}/${connection.repoName}/hooks`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: "application/vnd.github+json",
						"Content-Type": "application/json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
					body: JSON.stringify({
						name: "web",
						config: {
							url: webhookUrl,
							content_type: "json",
							secret: webhookSecret,
						},
						events: ["push", "pull_request", "pull_request_review", "issues"],
						active: true,
					}),
				},
			);

			if (!resp.ok) {
				if (resp.status === 403) {
					console.log(
						"[githubWebhook] Webhook registration skipped — token lacks admin scope. Periodic sync will be used instead.",
					);
				} else {
					const errorText = await resp.text();
					console.error(
						`[githubWebhook] Failed to register webhook (${resp.status}): ${errorText}`,
					);
				}
				return null;
			}

			const hookData = await resp.json();
			const webhookId = hookData.id;

			// Store webhook ID and secret on the connection
			await ctx.runMutation(updateWebhookIdRef, {
				connectionId: args.connectionId,
				webhookId,
				webhookSecret,
			});

			console.log(
				`[githubWebhook] Registered webhook ${webhookId} for ${connection.repoOwner}/${connection.repoName}`,
			);
		} catch (error) {
			console.error("[githubWebhook] Error registering webhook:", error);
		}

		return null;
	},
});

// ── Deregister Webhook ───────────────────────────────────────────────────

/**
 * Deregister a GitHub webhook when a repository is disconnected.
 * Calls the GitHub API to delete the hook and clears stored credentials.
 */
export const deregisterWebhook = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Fetch connection with webhook details
		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});

		if (!connection) {
			console.warn(`[githubWebhook] Connection ${args.connectionId} not found`);
			return null;
		}

		if (!connection.webhookId) {
			console.log(
				`[githubWebhook] No webhook to deregister for ${connection.repoOwner}/${connection.repoName}`,
			);
			return null;
		}

		// Decrypt the access token
		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error(
				"[githubWebhook] Failed to decrypt token for deregistration:",
				error,
			);
			return null;
		}

		// Delete the webhook from GitHub
		try {
			const resp = await fetch(
				`${GITHUB_API_BASE}/repos/${connection.repoOwner}/${connection.repoName}/hooks/${connection.webhookId}`,
				{
					method: "DELETE",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
				},
			);

			if (!resp.ok && resp.status !== 404) {
				const errorText = await resp.text();
				console.error(
					`[githubWebhook] Failed to delete webhook (${resp.status}): ${errorText}`,
				);
			} else {
				console.log(
					`[githubWebhook] Deregistered webhook ${connection.webhookId} for ${connection.repoOwner}/${connection.repoName}`,
				);
			}
		} catch (error) {
			console.error("[githubWebhook] Error deregistering webhook:", error);
		}

		return null;
	},
});

// ── Handle Webhook (Public Action) ───────────────────────────────────────

/**
 * Public action called by the Next.js webhook API route.
 * Verifies the HMAC-SHA256 signature against the per-connection webhook
 * secret, then schedules incremental processing for push events.
 *
 * Returns a status object indicating the result:
 * - { status: "queued" } — push event accepted and processing scheduled
 * - { status: "ignored" } — non-push event or non-default-branch push
 * - { status: "invalid_signature" } — HMAC verification failed
 * - { status: "error", message: string } — processing error
 */
export const handleWebhook = action({
	args: {
		rawBody: v.string(),
		signature: v.string(),
		event: v.string(),
		deliveryId: v.string(),
	},
	returns: v.object({
		status: v.string(),
		message: v.optional(v.string()),
	}),
	handler: async (
		ctx: ActionCtx,
		args: HandleWebhookArgs,
	): Promise<HandleWebhookResult> => {
		const supportedEvents = [
			"push",
			"pull_request",
			"pull_request_review",
			"issues",
		];
		if (!supportedEvents.includes(args.event)) {
			return { status: "ignored", message: `Event type: ${args.event}` };
		}

		// Parse the payload
		let payload: unknown;
		try {
			payload = JSON.parse(args.rawBody) as unknown;
		} catch {
			return { status: "error", message: "Invalid JSON payload" };
		}

		const repoPayload = payload as {
			repository?: { full_name?: string; default_branch?: string };
		};
		const fullName = repoPayload.repository?.full_name;
		if (!fullName || !fullName.includes("/")) {
			return { status: "error", message: "Missing repository.full_name" };
		}

		const [repoOwner, repoName] = fullName.split("/");

		// Look up the connection by repo
		const connection = await ctx.runQuery(
			internal.ai.indexing.queries.getConnectionByRepo,
			{ repoOwner, repoName },
		);

		if (!connection) {
			return {
				status: "error",
				message: `No active connection for ${fullName}`,
			};
		}

		// Verify HMAC-SHA256 signature
		if (!connection.webhookSecret) {
			return { status: "error", message: "No webhook secret configured" };
		}

		if (!args.signature) {
			return { status: "invalid_signature", message: "Missing signature" };
		}

		const expectedSignature = `sha256=${createHmac("sha256", connection.webhookSecret).update(args.rawBody).digest("hex")}`;

		try {
			const sigBuffer = Buffer.from(args.signature);
			const expectedBuffer = Buffer.from(expectedSignature);

			if (
				sigBuffer.length !== expectedBuffer.length ||
				!timingSafeEqual(sigBuffer, expectedBuffer)
			) {
				return { status: "invalid_signature" };
			}
		} catch {
			return { status: "invalid_signature" };
		}

		// ── Dispatch by event type ───────────────────────────────────────
		if (args.event === "push") {
			const pushPayload = repoPayload as PushPayload;
			const expectedRef = `refs/heads/${connection.defaultBranch}`;
			if (pushPayload.ref !== expectedRef) {
				return {
					status: "ignored",
					message: `Push to ${pushPayload.ref}, not ${expectedRef}`,
				};
			}

			const processRef = makeFunctionReference<
				"action",
				{
					connectionId: Id<"githubConnections">;
					projectId: Id<"projects">;
					commits: Array<{
						id: string;
						added: string[];
						modified: string[];
						removed: string[];
					}>;
				},
				null
			>("ai/indexing/githubWebhook:processWebhookPush");

			await ctx.scheduler.runAfter(0, processRef, {
				connectionId: connection._id,
				projectId: connection.projectId,
				commits: pushPayload.commits.map((c) => ({
					id: c.id,
					added: c.added,
					modified: c.modified,
					removed: c.removed,
				})),
			});

			console.log(
				`[githubWebhook] Queued push processing for ${fullName} (${pushPayload.commits.length} commits)`,
			);
			return { status: "queued" };
		}

		if (args.event === "pull_request") {
			const processPrRef = makeFunctionReference<
				"action",
				{
					connectionId: Id<"githubConnections">;
					payload: string;
				},
				null
			>("ai/indexing/githubWebhook:processWebhookPullRequest");

			await ctx.scheduler.runAfter(0, processPrRef, {
				connectionId: connection._id,
				payload: args.rawBody,
			});

			console.log(
				`[githubWebhook] Queued PR processing for ${fullName} (#${(payload as { pull_request?: { number?: number } }).pull_request?.number})`,
			);
			return { status: "queued" };
		}

		if (args.event === "pull_request_review") {
			const processReviewRef = makeFunctionReference<
				"action",
				{
					connectionId: Id<"githubConnections">;
					payload: string;
				},
				null
			>("ai/indexing/githubWebhook:processWebhookPrReview");

			await ctx.scheduler.runAfter(0, processReviewRef, {
				connectionId: connection._id,
				payload: args.rawBody,
			});

			console.log(
				`[githubWebhook] Queued PR review processing for ${fullName}`,
			);
			return { status: "queued" };
		}

		if (args.event === "issues") {
			const processIssueRef = makeFunctionReference<
				"action",
				{
					connectionId: Id<"githubConnections">;
					payload: string;
				},
				null
			>("ai/indexing/githubWebhook:processWebhookIssue");

			await ctx.scheduler.runAfter(0, processIssueRef, {
				connectionId: connection._id,
				payload: args.rawBody,
			});

			console.log(
				`[githubWebhook] Queued issue processing for ${fullName} (#${(payload as { issue?: { number?: number } }).issue?.number})`,
			);
			return { status: "queued" };
		}

		return { status: "ignored", message: `Unhandled event: ${args.event}` };
	},
});

// ── Process Webhook Push ─────────────────────────────────────────────────

/**
 * Process a GitHub push event by incrementally updating the code RAG index.
 *
 * For each commit in the push:
 * - Removed files: delete RAG chunks and sync records
 * - Added/modified files: fetch content, chunk, and embed
 *
 * Files are deduplicated across commits and processed in batches.
 */
export const processWebhookPush = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		commits: v.array(
			v.object({
				id: v.string(),
				added: v.array(v.string()),
				modified: v.array(v.string()),
				removed: v.array(v.string()),
			}),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { connectionId, projectId, commits } = args;

		// Fetch connection
		const connection = await ctx.runQuery(
			internal.ai.indexing.queries.getGithubConnection,
			{ projectId },
		);

		if (!connection) {
			console.warn(
				`[githubWebhook] No active connection for project ${projectId}`,
			);
			return null;
		}

		// Decrypt access token
		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubWebhook] Failed to decrypt access token:", error);
			return null;
		}

		// Collect unique file changes across all commits
		const addedSet = new Set<string>();
		const modifiedSet = new Set<string>();
		const removedSet = new Set<string>();

		for (const commit of commits) {
			for (const file of commit.added) addedSet.add(file);
			for (const file of commit.modified) modifiedSet.add(file);
			for (const file of commit.removed) removedSet.add(file);
		}

		// If a file was both added and removed in the same push, treat it
		// based on the final state. If removed last, it's removed. If added
		// after removal, treat as added.
		// Simple heuristic: if it's in removed AND added/modified, treat as modified.
		for (const file of removedSet) {
			if (addedSet.has(file) || modifiedSet.has(file)) {
				removedSet.delete(file);
				modifiedSet.add(file);
			}
		}
		// Merge added into modified for uniform processing (both need fetch+chunk)
		for (const file of addedSet) {
			modifiedSet.add(file);
		}

		const namespace = getCodeNamespace(projectId);
		const { repoOwner, repoName, defaultBranch } = connection;

		// ── Process removed files ────────────────────────────────────────────
		const removedFiles = [...removedSet].filter((f) => shouldIndexFile(f));
		let removedCount = 0;

		for (const filePath of removedFiles) {
			try {
				// Delete sync record and get RAG entry ID
				const ragEntryId = await ctx.runMutation(
					internal.ai.indexing.syncHelpers.deleteSyncRecord,
					{
						projectId,
						sourceType: "github_file",
						sourceId: filePath,
					},
				);

				// Delete RAG entry if we have the ID
				if (ragEntryId) {
					// biome-ignore lint/suspicious/noExplicitAny: RAG entryId requires branded type
					await getRag().delete(ctx, { entryId: ragEntryId as any });
				}

				removedCount++;
			} catch (error) {
				console.error(`[githubWebhook] Error removing ${filePath}:`, error);
			}
		}

		// ── Process added/modified files ─────────────────────────────────────
		const changedFiles = [...modifiedSet].filter((f) => shouldIndexFile(f));
		let indexedCount = 0;
		let skippedCount = 0;

		for (let i = 0; i < changedFiles.length; i += WEBHOOK_BATCH_SIZE) {
			const batch = changedFiles.slice(i, i + WEBHOOK_BATCH_SIZE);

			await Promise.all(
				batch.map(async (filePath) => {
					try {
						const result = await processChangedFile(
							ctx,
							filePath,
							projectId,
							namespace,
							repoOwner,
							repoName,
							defaultBranch,
							accessToken,
						);
						if (result === "indexed") {
							indexedCount++;
						} else {
							skippedCount++;
						}
					} catch (error) {
						console.error(
							`[githubWebhook] Error processing ${filePath}:`,
							error,
						);
					}
				}),
			);

			// Rate limiting between batches
			if (i + WEBHOOK_BATCH_SIZE < changedFiles.length) {
				await new Promise((resolve) =>
					setTimeout(resolve, WEBHOOK_BATCH_DELAY_MS),
				);
			}
		}

		console.log(
			`[githubWebhook] Push processed for ${repoOwner}/${repoName}: ` +
				`${indexedCount} indexed, ${skippedCount} skipped, ${removedCount} removed`,
		);

		// Update last sync timestamp
		await ctx.runMutation(updateLastSyncRef, { connectionId });

		return null;
	},
});

// ── File processing helper ───────────────────────────────────────────────

/**
 * Fetch a changed file from GitHub, chunk it, and embed into RAG.
 * Reuses the same logic as the initial indexer but fetches the latest
 * version from the default branch.
 */
async function processChangedFile(
	ctx: ActionCtx,
	filePath: string,
	projectId: Id<"projects">,
	namespace: string,
	repoOwner: string,
	repoName: string,
	defaultBranch: string,
	accessToken: string,
): Promise<"indexed" | "skipped"> {
	// Fetch file content from raw.githubusercontent.com
	const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${defaultBranch}/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
	let content: string;
	try {
		const resp = await fetch(rawUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!resp.ok) {
			console.warn(
				`[githubWebhook] Failed to fetch ${filePath} (${resp.status})`,
			);
			return "skipped";
		}
		content = await resp.text();
	} catch {
		return "skipped";
	}

	if (!content.trim()) {
		return "skipped";
	}

	// Compute a content hash for deduplication
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = new Uint8Array(hashBuffer);
	const contentHash = Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Check if content is unchanged
	const existingSync = await ctx.runQuery(
		internal.ai.indexing.syncHelpers.getSyncRecord,
		{
			projectId,
			sourceType: "github_file",
			sourceId: filePath,
		},
	);

	if (existingSync?.contentHash === contentHash) {
		return "skipped";
	}

	// Detect language and chunk
	const language = detectLanguage(filePath);
	const chunks = chunkCodeFile(content, language);

	if (chunks.length === 0) {
		return "skipped";
	}

	// Build RAG-ready text chunks with metadata header
	const ragChunks = chunks.map((chunk) =>
		formatChunkForRag(chunk, filePath, language),
	);

	try {
		// biome-ignore lint/suspicious/noExplicitAny: RAG metadata type is restricted
		const codeMetadata: any = {
			sourceId: filePath,
			projectId: projectId as string,
			sourceType: "github_file" as const,
			title: filePath,
			language,
			startLine: chunks[0].startLine,
			endLine: chunks[chunks.length - 1].endLine,
			symbolName: chunks[0]?.symbolName ?? undefined,
		};

		const key = `github_file:${filePath}`;
		const ragAddArgs = {
			namespace,
			key,
			contentHash,
			filterValues: [
				{ name: "sourceType" as const, value: "github_file" as const },
			],
			metadata: codeMetadata,
		};

		const { entryId, replacedEntry } =
			ragChunks.length === 1
				? await getRag().add(ctx, { ...ragAddArgs, text: ragChunks[0] })
				: await getRag().add(ctx, { ...ragAddArgs, chunks: ragChunks });

		// Clean up replaced entry
		if (replacedEntry) {
			await getRag().delete(ctx, { entryId: replacedEntry.entryId });
		}

		// Update sync status
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType: "github_file",
			sourceId: filePath,
			contentHash,
			chunkCount: ragChunks.length,
			status: "synced",
			ragEntryId: entryId,
		});

		return "indexed";
	} catch (error) {
		console.error(`[githubWebhook] Failed to embed ${filePath}:`, error);
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType: "github_file",
			sourceId: filePath,
			contentHash,
			chunkCount: 0,
			status: "error",
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		});
		return "skipped";
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatChunkForRag(
	chunk: CodeChunk,
	filePath: string,
	language: string,
): string {
	const header = [
		`File: ${filePath}`,
		`Language: ${language}`,
		`Lines: ${chunk.startLine}-${chunk.endLine}`,
		chunk.symbolName ? `Symbol: ${chunk.symbolName}` : null,
		chunk.chunkType !== "block" ? `Type: ${chunk.chunkType}` : null,
	]
		.filter(Boolean)
		.join(" | ");

	return `[${header}]\n${chunk.content}`;
}

// ── PR Webhook Handler ──────────────────────────────────────────────────

/**
 * Process a pull_request webhook event.
 * Upserts the PR into the githubPullRequests table with auto-linking.
 */
export const processWebhookPullRequest = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		payload: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const data = JSON.parse(args.payload);
		const pr = data.pull_request;
		if (!pr) return null;

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		const prState: "open" | "closed" | "merged" | "draft" = pr.merged_at
			? "merged"
			: pr.draft
				? "draft"
				: pr.state;

		// Auto-detect linked issue
		const settings = await ctx.runQuery(
			internal.githubSync.getWorkspaceSettings,
			{ workspaceId: connection.workspaceId },
		);
		let linkedIssueId: Id<"issues"> | undefined;
		if (settings) {
			const prefix = settings.issuePrefix ?? settings.storyPrefix;
			if (prefix) {
				const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const pattern = new RegExp(`\\b${escapedPrefix}-(\\d{1,6})\\b`, "i");
				const sources = [
					pr.head?.ref ?? "",
					pr.title ?? "",
					(pr.body ?? "").slice(0, 2000),
				];
				for (const source of sources) {
					const match = source.match(pattern);
					if (match) {
						const identifier =
							`${prefix}-${match[1].padStart(3, "0")}`.toUpperCase();
						const issue = await ctx.runQuery(
							internal.githubSync.resolveIssueByIdentifier,
							{
								workspaceId: connection.workspaceId,
								identifier,
							},
						);
						if (issue) {
							linkedIssueId = issue._id;
							break;
						}
					}
				}
			}
		}

		await ctx.runMutation(internal.githubSync.upsertPullRequest, {
			connectionId: args.connectionId,
			projectId: connection.projectId,
			workspaceId: connection.workspaceId,
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
			mergedAt: pr.merged_at ? new Date(pr.merged_at).getTime() : undefined,
			closedAt: pr.closed_at ? new Date(pr.closed_at).getTime() : undefined,
			reviewDecision: undefined,
			linkedIssueId,
			githubCreatedAt: new Date(pr.created_at).getTime(),
			githubUpdatedAt: new Date(pr.updated_at).getTime(),
		});

		console.log(
			`[githubWebhook] Processed PR #${pr.number} (${data.action}) for ${connection.repoOwner}/${connection.repoName}`,
		);
		return null;
	},
});

// ── PR Review Webhook Handler ───────────────────────────────────────────

/**
 * Process a pull_request_review event.
 * Updates the review decision on the existing PR record.
 */
export const processWebhookPrReview = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		payload: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const data = JSON.parse(args.payload);
		const review = data.review;
		const pr = data.pull_request;
		if (!review || !pr) return null;

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		// Map review state to our review decision
		let reviewDecision:
			| "approved"
			| "changes_requested"
			| "pending"
			| undefined;
		switch (review.state) {
			case "approved":
				reviewDecision = "approved";
				break;
			case "changes_requested":
				reviewDecision = "changes_requested";
				break;
			default:
				reviewDecision = "pending";
		}

		const prState: "open" | "closed" | "merged" | "draft" = pr.merged_at
			? "merged"
			: pr.draft
				? "draft"
				: pr.state;

		await ctx.runMutation(internal.githubSync.upsertPullRequest, {
			connectionId: args.connectionId,
			projectId: connection.projectId,
			workspaceId: connection.workspaceId,
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
			mergedAt: pr.merged_at ? new Date(pr.merged_at).getTime() : undefined,
			closedAt: pr.closed_at ? new Date(pr.closed_at).getTime() : undefined,
			reviewDecision,
			githubCreatedAt: new Date(pr.created_at).getTime(),
			githubUpdatedAt: new Date(pr.updated_at).getTime(),
		});

		console.log(
			`[githubWebhook] Processed PR review on #${pr.number} (${review.state})`,
		);
		return null;
	},
});

// ── Issue Webhook Handler ───────────────────────────────────────────────

/**
 * Process an issues webhook event.
 * Creates or updates Clave issues based on GitHub issue changes.
 */
export const processWebhookIssue = internalAction({
	args: {
		connectionId: v.id("githubConnections"),
		payload: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const data = JSON.parse(args.payload);
		const ghIssue = data.issue;
		if (!ghIssue) return null;

		const connection = await ctx.runMutation(getConnectionInternalRef, {
			connectionId: args.connectionId,
		});
		if (!connection || connection.status !== "active") return null;

		// Check if issue sync is enabled
		const fullConn = await ctx.runQuery(
			internal.githubSync.getConnectionCreator,
			{ connectionId: args.connectionId },
		);
		// We need the full connection to check issueSyncEnabled
		// For now, we process all issue events (the connection flags are checked at the action level)

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
				return null;
			}

			// Loop prevention: if last sync was from Clave, this might be the echo
			if (existingSync.syncSource === "clave") {
				// Update the timestamp but don't modify the Clave issue
				await ctx.runMutation(internal.githubSync.upsertIssueSync, {
					connectionId: args.connectionId,
					projectId: connection.projectId,
					workspaceId: connection.workspaceId,
					githubIssueId: ghIssue.id,
					githubIssueNumber: ghIssue.number,
					githubIssueUrl: ghIssue.html_url,
					claveIssueId: existingSync.claveIssueId,
					lastGithubUpdatedAt: ghIssue.updated_at,
					syncSource: "github",
					syncStatus: "synced",
				});
				return null;
			}

			// Update the existing Clave issue
			const claveStatus =
				ghIssue.state === "closed"
					? "done"
					: ghIssue.assignee
						? "in_progress"
						: "todo";
			await ctx.runMutation(internal.githubSync.updateIssueFromGithub, {
				issueId: existingSync.claveIssueId,
				title: ghIssue.title,
				description: ghIssue.body ?? undefined,
				status: claveStatus,
			});

			await ctx.runMutation(internal.githubSync.upsertIssueSync, {
				connectionId: args.connectionId,
				projectId: connection.projectId,
				workspaceId: connection.workspaceId,
				githubIssueId: ghIssue.id,
				githubIssueNumber: ghIssue.number,
				githubIssueUrl: ghIssue.html_url,
				claveIssueId: existingSync.claveIssueId,
				lastGithubUpdatedAt: ghIssue.updated_at,
				syncSource: "github",
				syncStatus: "synced",
			});
		} else if (data.action === "opened") {
			// Create new Clave issue from GitHub
			if (!fullConn) return null;
			const claveStatus = ghIssue.assignee ? "in_progress" : "todo";
			const result = await ctx.runMutation(
				internal.githubSync.createIssueFromGithub,
				{
					workspaceId: connection.workspaceId,
					projectId: connection.projectId,
					title: ghIssue.title,
					description: ghIssue.body ?? undefined,
					status: claveStatus,
					createdBy: fullConn.createdBy,
				},
			);

			await ctx.runMutation(internal.githubSync.upsertIssueSync, {
				connectionId: args.connectionId,
				projectId: connection.projectId,
				workspaceId: connection.workspaceId,
				githubIssueId: ghIssue.id,
				githubIssueNumber: ghIssue.number,
				githubIssueUrl: ghIssue.html_url,
				claveIssueId: result.issueId,
				lastGithubUpdatedAt: ghIssue.updated_at,
				syncSource: "github",
				syncStatus: "synced",
			});

			console.log(
				`[githubWebhook] Created Clave issue ${result.identifier} from GitHub #${ghIssue.number}`,
			);
		}

		return null;
	},
});
