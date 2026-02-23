"use node";

/**
 * GitHub Repository Indexer — RAG indexing pipeline for GitHub code.
 *
 * Fetches the repository file tree, filters to indexable code files,
 * batch-fetches content, applies code-aware chunking, and embeds
 * chunks into the project's code RAG namespace.
 *
 * Uses the `project:{projectId}:code` namespace (separate from content).
 * Incremental sync via Git blob SHA — skips files whose SHA hasn't changed.
 *
 * Rate limiting: processes files in batches of 20 with 200ms delays.
 * Uses raw.githubusercontent.com for content (doesn't count against API limit).
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { internalAction } from "../../_generated/server";
import { getCodeNamespace, rag } from "../rag";
import {
	type CodeChunk,
	chunkCodeFile,
	decryptToken,
	detectLanguage,
	shouldIndexFile,
} from "./githubUtils";

// Function references for github.ts (not yet in generated types)
const updateStatusRef = makeFunctionReference<
	"mutation",
	{
		connectionId: Id<"githubConnections">;
		status: "active" | "disconnected" | "error";
	},
	null
>("github:updateStatus");

const updateLastSyncRef = makeFunctionReference<
	"mutation",
	{ connectionId: Id<"githubConnections"> },
	null
>("github:updateLastSync");

// ── Constants ────────────────────────────────────────────────────────────

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 200;
const GITHUB_API_BASE = "https://api.github.com";

// ── Types ────────────────────────────────────────────────────────────────

interface TreeEntry {
	path: string;
	sha: string;
	size?: number;
	type: string;
}

// ── Main indexing action ─────────────────────────────────────────────────

/**
 * Index a full GitHub repository into the code RAG namespace.
 *
 * Flow:
 * 1. Fetch the GitHub connection and decrypt the access token
 * 2. Fetch the default branch's latest commit SHA
 * 3. Fetch the recursive file tree
 * 4. Filter to indexable code files
 * 5. Process in batches: check SHA, fetch content, chunk, embed
 * 6. Update lastSyncAt on the connection
 */
export const indexRepository = internalAction({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { projectId } = args;

		// 1. Fetch the GitHub connection for this project
		const connection = await ctx.runQuery(
			internal.ai.indexing.queries.getGithubConnection,
			{ projectId },
		);

		if (!connection) {
			console.warn(
				`[githubIndexer] No active GitHub connection for project ${projectId}`,
			);
			return null;
		}

		// 2. Decrypt the access token
		let accessToken: string;
		try {
			accessToken = await decryptToken(connection.accessToken);
		} catch (error) {
			console.error("[githubIndexer] Failed to decrypt access token:", error);
			await ctx.runMutation(updateStatusRef, {
				connectionId: connection._id,
				status: "error",
			});
			return null;
		}

		const { repoOwner, repoName, defaultBranch } = connection;
		const headers = {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		};

		// 3. Fetch the default branch's latest commit SHA
		let treeSha: string;
		try {
			const branchResp = await fetch(
				`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/branches/${defaultBranch}`,
				{ headers },
			);

			if (!branchResp.ok) {
				const errorText = await branchResp.text();
				console.error(
					`[githubIndexer] Failed to fetch branch (${branchResp.status}): ${errorText}`,
				);
				await ctx.runMutation(updateStatusRef, {
					connectionId: connection._id,
					status: "error",
				});
				return null;
			}

			const branchData = await branchResp.json();
			treeSha = branchData.commit.sha;
		} catch (error) {
			console.error("[githubIndexer] Failed to fetch branch info:", error);
			return null;
		}

		// 4. Fetch the recursive file tree
		let treeEntries: TreeEntry[];
		try {
			const treeResp = await fetch(
				`${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/git/trees/${treeSha}?recursive=1`,
				{ headers },
			);

			if (!treeResp.ok) {
				const errorText = await treeResp.text();
				console.error(
					`[githubIndexer] Failed to fetch tree (${treeResp.status}): ${errorText}`,
				);
				return null;
			}

			const treeData = await treeResp.json();
			treeEntries = (treeData.tree ?? []).filter(
				(entry: TreeEntry) => entry.type === "blob",
			);
		} catch (error) {
			console.error("[githubIndexer] Failed to fetch file tree:", error);
			return null;
		}

		// 5. Filter to indexable files
		const indexableFiles = treeEntries.filter((entry) =>
			shouldIndexFile(entry.path, entry.size),
		);

		console.log(
			`[githubIndexer] Found ${indexableFiles.length} indexable files out of ${treeEntries.length} total for ${repoOwner}/${repoName}`,
		);

		// 6. Process in batches
		const namespace = getCodeNamespace(projectId);
		let indexedCount = 0;
		let skippedCount = 0;

		for (let i = 0; i < indexableFiles.length; i += BATCH_SIZE) {
			const batch = indexableFiles.slice(i, i + BATCH_SIZE);

			await Promise.all(
				batch.map(async (file) => {
					try {
						const result = await processFile(
							ctx,
							file,
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
							`[githubIndexer] Error processing ${file.path}:`,
							error,
						);
					}
				}),
			);

			// Rate limiting delay between batches
			if (i + BATCH_SIZE < indexableFiles.length) {
				await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
			}
		}

		console.log(
			`[githubIndexer] Completed: ${indexedCount} indexed, ${skippedCount} skipped for ${repoOwner}/${repoName}`,
		);

		// 7. Update lastSyncAt
		await ctx.runMutation(updateLastSyncRef, {
			connectionId: connection._id,
		});

		return null;
	},
});

// ── File processing ──────────────────────────────────────────────────────

async function processFile(
	ctx: ActionCtx,
	file: TreeEntry,
	projectId: Id<"projects">,
	namespace: string,
	repoOwner: string,
	repoName: string,
	defaultBranch: string,
	accessToken: string,
): Promise<"indexed" | "skipped"> {
	// Check if file SHA is unchanged (use git blob SHA as content hash)
	const existingSync = await ctx.runQuery(
		internal.ai.indexing.syncHelpers.getSyncRecord,
		{
			projectId,
			sourceType: "github_file",
			sourceId: file.path,
		},
	);

	if (existingSync?.contentHash === file.sha) {
		return "skipped";
	}

	// Fetch file content from raw.githubusercontent.com (no API rate limit)
	const rawUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${defaultBranch}/${encodeURIComponent(file.path).replace(/%2F/g, "/")}`;
	let content: string;
	try {
		const resp = await fetch(rawUrl, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!resp.ok) {
			console.warn(
				`[githubIndexer] Failed to fetch ${file.path} (${resp.status})`,
			);
			return "skipped";
		}
		content = await resp.text();
	} catch {
		return "skipped";
	}

	// Skip empty files
	if (!content.trim()) {
		return "skipped";
	}

	// Detect language and chunk
	const language = detectLanguage(file.path);
	const chunks = chunkCodeFile(content, language);

	if (chunks.length === 0) {
		return "skipped";
	}

	// Build RAG-ready text chunks with metadata header
	const ragChunks = chunks.map((chunk) =>
		formatChunkForRag(chunk, file.path, language),
	);

	try {
		// Embed into code namespace
		// biome-ignore lint/suspicious/noExplicitAny: RAG metadata type is restricted but storage supports arbitrary fields
		const codeMetadata: any = {
			sourceId: file.path,
			projectId: projectId as string,
			sourceType: "github_file" as const,
			title: file.path,
			language,
			startLine: chunks[0].startLine,
			endLine: chunks[chunks.length - 1].endLine,
			symbolName: chunks[0]?.symbolName ?? undefined,
		};

		const key = `github_file:${file.path}`;
		const ragAddArgs = {
			namespace,
			key,
			contentHash: file.sha,
			filterValues: [
				{ name: "sourceType" as const, value: "github_file" as const },
			],
			metadata: codeMetadata,
		};

		const { entryId, replacedEntry } =
			ragChunks.length === 1
				? await rag.add(ctx, { ...ragAddArgs, text: ragChunks[0] })
				: await rag.add(ctx, { ...ragAddArgs, chunks: ragChunks });

		// Clean up replaced entry
		if (replacedEntry) {
			await rag.delete(ctx, { entryId: replacedEntry.entryId });
		}

		// Update sync status
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType: "github_file",
			sourceId: file.path,
			contentHash: file.sha,
			chunkCount: ragChunks.length,
			status: "synced",
			ragEntryId: entryId,
		});

		return "indexed";
	} catch (error) {
		console.error(`[githubIndexer] Failed to embed ${file.path}:`, error);
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType: "github_file",
			sourceId: file.path,
			contentHash: file.sha,
			chunkCount: 0,
			status: "error",
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		});
		return "skipped";
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Format a code chunk with a metadata header for better search relevance.
 * The header includes file path, language, and line range.
 */
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
