import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

const MAX_RECORDING_SECONDS = 20 * 60;
const MAX_RECORDING_BYTES = 25 * 1024 * 1024;

// ── Public mutations ─────────────────────────────────────────────────────

/** Generate an upload URL for audio recording storage */
export const generateUploadUrl = mutation({
	args: { workspaceId: v.id("workspaces") },
	returns: v.string(),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		return await ctx.storage.generateUploadUrl();
	},
});

/** Create a new audio recording record */
export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		storageId: v.id("_storage"),
		mimeType: v.string(),
		duration: v.optional(v.number()),
		fileSize: v.optional(v.number()),
	},
	returns: v.id("audioRecordings"),
	handler: async (ctx, args) => {
		if (args.duration && args.duration > MAX_RECORDING_SECONDS) {
			throw new ConvexError(
				`Recording is too long (${Math.round(args.duration)}s). Maximum is ${MAX_RECORDING_SECONDS}s.`,
			);
		}
		if (args.fileSize && args.fileSize > MAX_RECORDING_BYTES) {
			throw new ConvexError(
				`Recording is too large (${args.fileSize} bytes). Maximum is ${MAX_RECORDING_BYTES} bytes.`,
			);
		}

		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		return await ctx.db.insert("audioRecordings", {
			workspaceId: args.workspaceId,
			userId,
			storageId: args.storageId,
			mimeType: args.mimeType,
			duration: args.duration,
			fileSize: args.fileSize,
			status: "ready",
			retryCount: 0,
			createdAt: Date.now(),
		});
	},
});

/** Get a single audio recording (auth-gated) */
export const get = query({
	args: { id: v.id("audioRecordings") },
	returns: v.union(
		v.object({
			_id: v.id("audioRecordings"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			userId: v.id("users"),
			storageId: v.optional(v.id("_storage")),
			mimeType: v.string(),
			duration: v.optional(v.number()),
			fileSize: v.optional(v.number()),
			status: v.union(
				v.literal("uploading"),
				v.literal("ready"),
				v.literal("transcribing"),
				v.literal("transcribed"),
				v.literal("failed"),
			),
			transcript: v.optional(v.string()),
			transcriptFormat: v.optional(v.string()),
			transcriptLanguage: v.optional(v.string()),
			transcriptDurationSeconds: v.optional(v.number()),
			transcriptSegmentsJson: v.optional(v.string()),
			errorMessage: v.optional(v.string()),
			retryCount: v.number(),
			createdAt: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const recording = await ctx.db.get(args.id);
		if (!recording) return null;
		await requireWorkspaceMember(ctx, recording.workspaceId);
		return recording;
	},
});

/** Delete a recording owned by the current user */
export const deleteRecording = mutation({
	args: { id: v.id("audioRecordings") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const recording = await ctx.db.get(args.id);
		if (!recording) return null;

		const { userId } = await requireWorkspaceMember(ctx, recording.workspaceId);
		if (recording.userId !== userId) {
			throw new ConvexError("You can only delete your own recordings");
		}

		if (recording.storageId) {
			await ctx.storage.delete(recording.storageId);
		}
		await ctx.db.delete(args.id);
		return null;
	},
});

// ── Internal mutations ───────────────────────────────────────────────────

/** Update the status of an audio recording */
export const updateStatus = internalMutation({
	args: {
		id: v.id("audioRecordings"),
		status: v.union(
			v.literal("uploading"),
			v.literal("ready"),
			v.literal("transcribing"),
			v.literal("transcribed"),
			v.literal("failed"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, { status: args.status });
		return null;
	},
});

/** Update the transcript on success */
export const updateTranscript = internalMutation({
	args: {
		id: v.id("audioRecordings"),
		transcript: v.string(),
		transcriptFormat: v.optional(v.string()),
		transcriptLanguage: v.optional(v.string()),
		transcriptDurationSeconds: v.optional(v.number()),
		transcriptSegmentsJson: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.id, {
			status: "transcribed" as const,
			transcript: args.transcript,
			transcriptFormat: args.transcriptFormat,
			transcriptLanguage: args.transcriptLanguage,
			transcriptDurationSeconds: args.transcriptDurationSeconds,
			transcriptSegmentsJson: args.transcriptSegmentsJson,
		});
		return null;
	},
});

/** Mark a recording as failed */
export const markFailed = internalMutation({
	args: {
		id: v.id("audioRecordings"),
		errorMessage: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const recording = await ctx.db.get(args.id);
		if (!recording) return null;
		await ctx.db.patch(args.id, {
			status: "failed" as const,
			errorMessage: args.errorMessage,
			retryCount: recording.retryCount + 1,
		});
		return null;
	},
});

/** Hard-delete a recording and its storage object */
export const remove = internalMutation({
	args: { id: v.id("audioRecordings") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const recording = await ctx.db.get(args.id);
		if (!recording) return null;
		if (recording.storageId) {
			await ctx.storage.delete(recording.storageId);
		}
		await ctx.db.delete(args.id);
		return null;
	},
});

// ── Internal queries ─────────────────────────────────────────────────────

/** List recordings older than the given cutoff timestamp */
export const listOlderThan = internalQuery({
	args: { cutoff: v.number() },
	returns: v.array(v.id("audioRecordings")),
	handler: async (ctx, args) => {
		const recordings = await ctx.db
			.query("audioRecordings")
			.withIndex("by_created_at", (q) => q.lt("createdAt", args.cutoff))
			.collect();
		return recordings.map((r) => r._id);
	},
});

/** Get a recording by ID (internal — no auth check) */
export const getInternal = internalQuery({
	args: { id: v.id("audioRecordings") },
	returns: v.union(
		v.object({
			_id: v.id("audioRecordings"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			userId: v.id("users"),
			storageId: v.optional(v.id("_storage")),
			mimeType: v.string(),
			duration: v.optional(v.number()),
			fileSize: v.optional(v.number()),
			status: v.union(
				v.literal("uploading"),
				v.literal("ready"),
				v.literal("transcribing"),
				v.literal("transcribed"),
				v.literal("failed"),
			),
			transcript: v.optional(v.string()),
			transcriptFormat: v.optional(v.string()),
			transcriptLanguage: v.optional(v.string()),
			transcriptDurationSeconds: v.optional(v.number()),
			transcriptSegmentsJson: v.optional(v.string()),
			errorMessage: v.optional(v.string()),
			retryCount: v.number(),
			createdAt: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// ── Cleanup action ───────────────────────────────────────────────────────

/** Delete all audio recordings older than 2 days */
export const cleanupStale = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
		const staleIds = await ctx.runQuery(
			internal.audioRecordings.listOlderThan,
			{ cutoff: twoDaysAgo },
		);
		for (const id of staleIds) {
			await ctx.runMutation(internal.audioRecordings.remove, { id });
		}
		return null;
	},
});
