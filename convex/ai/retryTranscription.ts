"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

const MAX_RETRIES = 3;

/** Retry a failed transcription (max 3 attempts total) */
export const retry = action({
	args: { audioRecordingId: v.id("audioRecordings") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const recording = await ctx.runQuery(internal.audioRecordings.getInternal, {
			id: args.audioRecordingId,
		});

		if (!recording) {
			throw new ConvexError("Audio recording not found");
		}

		if (recording.retryCount >= MAX_RETRIES) {
			throw new ConvexError(
				`Maximum retry count (${MAX_RETRIES}) exceeded for this recording`,
			);
		}

		if (recording.status !== "failed") {
			// Avoid hard failures when the client retries in a race while the
			// recording is still transcribing/processing.
			if (recording.status === "transcribing") {
				return null;
			}
			return null;
		}

		await ctx.runAction(internal.ai.transcribe.run, {
			audioRecordingId: args.audioRecordingId,
		});

		return null;
	},
});
