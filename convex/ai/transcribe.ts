"use node";

import { experimental_transcribe as transcribe } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalAction } from "../_generated/server";
import {
	getTranscriptionModel,
	getTranscriptionRuntimeConfig,
} from "./transcription";

type TranscriptionSegment = {
	text: string;
	startSecond?: number;
	endSecond?: number;
	speaker?: string;
};

type NormalizedTranscription = {
	text: string;
	segments: TranscriptionSegment[];
	language?: string;
	durationInSeconds?: number;
	responseFormat: string;
};

/**
 * Transcribe an audio recording.
 *
 * Flow:
 *  1. Set status → "transcribing"
 *  2. Fetch the recording and resolve its storage URL
 *  3. Download audio binary
 *  4. Call Azure REST transcription (structured) with AI SDK fallback
 *  5. On success → update transcript
 *  6. On error → mark failed with error message
 */
export const run = internalAction({
	args: {
		audioRecordingId: v.id("audioRecordings"),
		prompt: v.optional(v.string()),
		language: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// 1. Set status to transcribing
		await ctx.runMutation(internal.audioRecordings.updateStatus, {
			id: args.audioRecordingId,
			status: "transcribing",
		});

		try {
			// 2. Fetch the recording record
			const recording = await ctx.runQuery(
				internal.audioRecordings.getInternal,
				{ id: args.audioRecordingId },
			);
			if (!recording) {
				throw new Error("Audio recording not found");
			}
			if (!recording.storageId) {
				throw new Error("Audio recording has no storage ID");
			}

			// 3. Get the storage URL and download the audio binary
			const url = await ctx.storage.getUrl(recording.storageId);
			if (!url) {
				throw new Error("Could not resolve storage URL for audio");
			}

			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(
					`Failed to download audio: ${response.status} ${response.statusText}`,
				);
			}
			const audioBuffer = await response.arrayBuffer();

			// 4. Transcribe using the Azure REST path first so we can use
			// structured response formats + server-side chunking strategy.
			let transcript: NormalizedTranscription;
			try {
				transcript = await transcribeViaAzureRest(
					audioBuffer,
					recording.mimeType,
					{
						prompt: args.prompt,
						language: args.language,
					},
				);
			} catch (restError) {
				console.warn(
					`[transcribe] REST transcription failed; falling back to AI SDK. Reason: ${toErrorMessage(restError)}`,
				);
				transcript = await transcribeViaAiSdk(audioBuffer, {
					prompt: args.prompt,
					language: args.language,
				});
			}

			// 5. Update transcript on success
			await ctx.runMutation(internal.audioRecordings.updateTranscript, {
				id: args.audioRecordingId,
				transcript: transcript.text,
				transcriptFormat: transcript.responseFormat,
				transcriptLanguage: transcript.language,
				transcriptDurationSeconds: transcript.durationInSeconds,
				transcriptSegmentsJson:
					transcript.segments.length > 0
						? JSON.stringify(transcript.segments)
						: undefined,
			});
		} catch (error) {
			// 6. Mark failed — never leave in "transcribing" state
			const message = toErrorMessage(error);
			await ctx.runMutation(internal.audioRecordings.markFailed, {
				id: args.audioRecordingId,
				errorMessage: message,
			});
		}

		return null;
	},
});

function extensionForMimeType(mimeType: string): string {
	const normalized = mimeType.toLowerCase();
	if (normalized.includes("webm")) return "webm";
	if (normalized.includes("wav")) return "wav";
	if (normalized.includes("ogg")) return "ogg";
	if (normalized.includes("opus")) return "opus";
	if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
	if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
	return "bin";
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Unknown transcription error";
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function normalizeTranscriptionPayload(
	payload: unknown,
	responseFormat: string,
): NormalizedTranscription {
	if (typeof payload === "string") {
		const text = payload.trim();
		if (!text) throw new Error("REST transcription returned empty text");
		return {
			text,
			segments: [],
			responseFormat,
		};
	}

	const record = asRecord(payload);
	if (!record) {
		throw new Error("REST transcription returned a non-object payload");
	}

	const segments: TranscriptionSegment[] = [];
	const rawSegments = Array.isArray(record.segments) ? record.segments : [];
	for (const item of rawSegments) {
		const segment = asRecord(item);
		if (!segment) continue;
		const text = asString(segment.text)?.trim();
		if (!text) continue;
		const speakerValue = segment.speaker;
		const speaker =
			typeof speakerValue === "string" || typeof speakerValue === "number"
				? String(speakerValue)
				: undefined;
		segments.push({
			text,
			startSecond: asNumber(segment.start),
			endSecond: asNumber(segment.end),
			speaker,
		});
	}

	let text = asString(record.text)?.trim() ?? "";
	if (!text && segments.length > 0) {
		text = segments
			.map((segment) => segment.text)
			.join(" ")
			.trim();
	}

	const words = Array.isArray(record.words) ? record.words : [];
	if (!text && words.length > 0) {
		text = words
			.map((word) => asString(asRecord(word)?.word) ?? "")
			.join(" ")
			.trim();
	}

	if (!text) {
		throw new Error("REST transcription returned no text");
	}

	const durationFromSegments = segments
		.map((segment) => segment.endSecond)
		.filter((value): value is number => typeof value === "number")
		.reduce((max, value) => Math.max(max, value), 0);

	return {
		text,
		segments,
		language: asString(record.language),
		durationInSeconds:
			asNumber(record.duration) ??
			(durationFromSegments > 0 ? durationFromSegments : undefined),
		responseFormat,
	};
}

async function transcribeViaAiSdk(
	audioBuffer: ArrayBuffer,
	options: {
		prompt?: string;
		language?: string;
	},
): Promise<NormalizedTranscription> {
	const providerOptions =
		options.prompt || options.language
			? {
					openai: {
						...(options.prompt ? { prompt: options.prompt } : {}),
						...(options.language ? { language: options.language } : {}),
					},
				}
			: undefined;

	const result = await transcribe({
		model: getTranscriptionModel(),
		audio: new Uint8Array(audioBuffer),
		...(providerOptions ? { providerOptions } : {}),
	});

	return {
		text: result.text,
		segments: result.segments.map((segment) => ({
			text: segment.text,
			startSecond: segment.startSecond,
			endSecond: segment.endSecond,
		})),
		language: result.language,
		durationInSeconds: result.durationInSeconds,
		responseFormat: "json",
	};
}

async function transcribeViaAzureRest(
	audioBuffer: ArrayBuffer,
	mimeType: string,
	options: {
		prompt?: string;
		language?: string;
	},
): Promise<NormalizedTranscription> {
	const apiKey = process.env.AZURE_API_KEY;
	if (!apiKey) {
		throw new Error("Missing AZURE_API_KEY for REST transcription");
	}

	const runtimeConfig = getTranscriptionRuntimeConfig();
	const endpointBase = runtimeConfig.baseUrl.replace(/\/+$/, "");
	const url = `${endpointBase}/openai/deployments/${runtimeConfig.deployment}/audio/transcriptions?api-version=${runtimeConfig.apiVersion}`;
	const preferredResponseFormat =
		runtimeConfig.mode === "diarized" ? "diarized_json" : "verbose_json";

	const attempts: Array<{
		responseFormat: "diarized_json" | "verbose_json" | "json";
		useChunking: boolean;
	}> =
		preferredResponseFormat === "diarized_json" &&
		runtimeConfig.chunkingStrategy === "server_vad"
			? [
					{
						responseFormat: "diarized_json",
						useChunking: true,
					},
					{
						responseFormat: "diarized_json",
						useChunking: false,
					},
					{
						responseFormat: "json",
						useChunking: false,
					},
				]
			: [
					{
						responseFormat: preferredResponseFormat,
						useChunking: runtimeConfig.chunkingStrategy === "server_vad",
					},
					{
						responseFormat: "json",
						useChunking: false,
					},
				];

	const fileExtension = extensionForMimeType(mimeType);
	const blob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });

	let lastError: Error | null = null;

	for (const attempt of attempts) {
		try {
			const formData = new FormData();
			formData.append("model", runtimeConfig.deployment);
			formData.append("file", blob, `recording.${fileExtension}`);
			formData.append("response_format", attempt.responseFormat);
			if (options.prompt) formData.append("prompt", options.prompt);
			if (options.language) formData.append("language", options.language);

			const shouldUseServerVad =
				runtimeConfig.chunkingStrategy === "server_vad" && attempt.useChunking;

			if (
				attempt.responseFormat === "diarized_json" &&
				runtimeConfig.mode === "diarized"
			) {
				formData.append(
					"chunking_strategy",
					shouldUseServerVad ? JSON.stringify({ type: "server_vad" }) : "auto",
				);
			} else if (
				attempt.responseFormat === "verbose_json" &&
				shouldUseServerVad
			) {
				formData.append("timestamp_granularities[]", "segment");
				formData.append(
					"chunking_strategy",
					JSON.stringify({ type: "server_vad" }),
				);
			}

			const response = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
				},
				body: formData,
			});

			const contentType = response.headers.get("content-type") ?? "";
			const bodyText = await response.text();
			if (!response.ok) {
				lastError = new Error(
					`REST transcription failed for ${attempt.responseFormat}: ${response.status} ${response.statusText} ${extractErrorDetails(bodyText).slice(0, 240)}`,
				);
				continue;
			}

			let payload: unknown = bodyText;
			if (contentType.includes("application/json")) {
				try {
					payload = JSON.parse(bodyText);
				} catch {
					// Keep raw text if JSON parsing fails.
				}
			}

			return normalizeTranscriptionPayload(payload, attempt.responseFormat);
		} catch (error) {
			lastError =
				error instanceof Error ? error : new Error(toErrorMessage(error));
		}
	}

	throw (
		lastError ??
		new Error("REST transcription failed without a specific error message")
	);
}

function extractErrorDetails(body: string): string {
	const trimmed = body.trim();
	if (!trimmed) return "No response body";

	const parsed = asRecord(tryParseJson(trimmed));
	if (!parsed) return trimmed;

	const nestedError = asRecord(parsed.error);
	const nestedErrorMessage = asString(nestedError?.message);
	if (nestedErrorMessage) return nestedErrorMessage;

	const topLevelMessage = asString(parsed.message);
	if (topLevelMessage) return topLevelMessage;

	return trimmed.slice(0, 200);
}

function tryParseJson(value: string): unknown | null {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

/**
 * Public action for client invocation — transcribe an audio recording.
 * Delegates to the internal `run` action.
 */
export const transcribeAudio = action({
	args: {
		audioRecordingId: v.id("audioRecordings"),
		prompt: v.optional(v.string()),
		language: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.runAction(internal.ai.transcribe.run, {
			audioRecordingId: args.audioRecordingId,
			prompt: args.prompt,
			language: args.language,
		});
		return null;
	},
});
