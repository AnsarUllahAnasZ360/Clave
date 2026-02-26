"use client";

import { useAction, useConvex, useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	MIN_RECORDING_SECONDS,
	useAudioRecorder,
} from "@/hooks/use-audio-recorder";
import {
	cacheDictation,
	getCachedDictationChunks,
	getPendingDictations,
	removeCachedDictation,
} from "@/lib/dictation-cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

export type DictationState =
	| "idle"
	| "requesting-permission"
	| "recording"
	| "processing"
	| "error";

export interface UseDictationOptions {
	workspaceId: Id<"workspaces">;
	onTranscript: (text: string) => void;
}

export interface UseDictationResult {
	state: DictationState;
	startDictation: () => void;
	stopDictation: () => void;
	duration: number;
	error: string | null;
	/** True when the failed chunk can still be retried (retryCount < 3). */
	canRetry: boolean;
	/** Retry transcription for the current failed chunk (does not re-upload audio). */
	retryTranscription: () => void;
	/** Delete the current failed recording and reset local dictation state. */
	discardRecording: () => void;
	/** Flush locally cached offline dictations. */
	flushPendingDictations: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 3;
const DICTATION_CHUNK_DURATION_MS = 60_000;
const TRANSCRIPTION_POLL_INTERVAL_MS = 700;
const TRANSCRIPTION_POLL_TIMEOUT_MS = 240_000;
const RETRY_BACKOFF_BASE_MS = 800;
const RETRY_BACKOFF_MAX_MS = 5000;

const VALID_MIME_TYPE_PREFIXES = [
	"audio/webm",
	"audio/mp4",
	"audio/m4a",
	"audio/wav",
	"audio/ogg",
];

function normalizeMimeType(mimeType: string): string | null {
	const normalized = mimeType.trim().toLowerCase();
	if (!normalized) return null;
	if (
		VALID_MIME_TYPE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
	) {
		return normalized.startsWith("audio/m4a") ? "audio/mp4" : normalized;
	}
	return null;
}

function toErrorMessage(value: unknown): string {
	if (value instanceof Error) return value.message;
	return "Unknown error";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
	const base = RETRY_BACKOFF_BASE_MS * 2 ** Math.max(attempt, 0);
	const capped = Math.min(base, RETRY_BACKOFF_MAX_MS);
	return capped + Math.random() * 250;
}

type PollingRecording = {
	status?: "uploading" | "ready" | "transcribing" | "transcribed" | "failed";
	retryCount?: number;
	transcript?: string;
	errorMessage?: string;
};

interface DictationSession {
	chunks: Blob[];
	mimeType: string;
	totalDuration: number;
	recordingIds: Array<Id<"audioRecordings"> | null>;
	transcripts: string[];
	failedChunkIndex: number | null;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useDictation({
	workspaceId,
	onTranscript,
}: UseDictationOptions): UseDictationResult {
	const recorder = useAudioRecorder();
	const [flowState, setFlowState] = useState<DictationState>("idle");
	const [recordingId, setRecordingId] = useState<Id<"audioRecordings"> | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const [canRetry, setCanRetry] = useState(false);

	const convex = useConvex();

	const generateUploadUrl = useMutation(api.audioRecordings.generateUploadUrl);
	const createRecording = useMutation(api.audioRecordings.create);
	const deleteRecording = useMutation(api.audioRecordings.deleteRecording);
	const transcribeAudio = useAction(api.ai.transcribe.transcribeAudio);
	const retryTranscriptionAction = useAction(api.ai.retryTranscription.retry);

	const onTranscriptRef = useRef(onTranscript);
	onTranscriptRef.current = onTranscript;

	const sessionRef = useRef<DictationSession | null>(null);
	const isProcessingRef = useRef(false);
	const flushInProgressRef = useRef(false);
	const flowStateRef = useRef<DictationState>("idle");

	const getRecording = useCallback(
		async (id: Id<"audioRecordings">): Promise<PollingRecording | null> => {
			const recording = await convex.query(api.audioRecordings.get, { id });
			return recording
				? {
						status: recording.status,
						retryCount: recording.retryCount,
						transcript: recording.transcript,
						errorMessage: recording.errorMessage,
					}
				: null;
		},
		[convex],
	);

	const waitForTranscription = useCallback(
		async (id: Id<"audioRecordings">): Promise<PollingRecording> => {
			const deadline = Date.now() + TRANSCRIPTION_POLL_TIMEOUT_MS;
			while (Date.now() <= deadline) {
				const recording = await getRecording(id);
				if (!recording) throw new Error("Recording not found");
				if (
					recording.status === "transcribed" ||
					recording.status === "failed"
				) {
					return recording;
				}
				await sleep(TRANSCRIPTION_POLL_INTERVAL_MS);
			}
			throw new Error("Transcription timed out");
		},
		[getRecording],
	);

	const uploadChunk = useCallback(
		async (chunk: Blob, mimeType: string): Promise<Id<"audioRecordings">> => {
			const uploadUrl = await generateUploadUrl({ workspaceId });
			const uploadResponse = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": mimeType },
				body: chunk,
			});

			if (!uploadResponse.ok) {
				throw new Error(
					`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
				);
			}

			const { storageId } = (await uploadResponse.json()) as {
				storageId: Id<"_storage">;
			};
			return await createRecording({
				workspaceId,
				storageId,
				mimeType,
				fileSize: chunk.size,
			});
		},
		[createRecording, generateUploadUrl, workspaceId],
	);

	const transcribeChunkWithRetries = useCallback(
		async (id: Id<"audioRecordings">): Promise<string> => {
			let lastError: string | null = null;

			for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
				if (!navigator.onLine) {
					throw new Error("You are offline");
				}

				try {
					if (attempt === 0) {
						await transcribeAudio({ audioRecordingId: id });
					} else {
						const recording = await getRecording(id);
						if (!recording || recording.status !== "failed") {
							await sleep(retryDelayMs(attempt - 1));
							continue;
						}
						await retryTranscriptionAction({ audioRecordingId: id });
					}

					const recording = await waitForTranscription(id);
					if (recording.status === "transcribed") {
						return recording.transcript?.trim() ?? "";
					}

					lastError = recording.errorMessage ?? "Transcription failed";
				} catch (error) {
					lastError = toErrorMessage(error);
				}

				if (attempt === MAX_RETRY_ATTEMPTS - 1) {
					break;
				}

				const recording = await getRecording(id);
				const retryCount = recording?.retryCount ?? 0;
				if (
					recording &&
					recording.status === "failed" &&
					retryCount >= MAX_RETRY_ATTEMPTS
				) {
					break;
				}

				await sleep(retryDelayMs(attempt));
			}

			throw new Error(lastError ?? "Transcription failed");
		},
		[
			getRecording,
			retryTranscriptionAction,
			transcribeAudio,
			waitForTranscription,
		],
	);

	const finalizeSession = useCallback(() => {
		const session = sessionRef.current;
		if (!session) {
			setFlowState("idle");
			recorder.resetRecording();
			return;
		}

		const finalText = session.transcripts
			.map((text) => text.trim())
			.filter(Boolean)
			.join("\n\n");

		if (finalText) {
			onTranscriptRef.current(finalText);
		} else {
			setError("No speech detected");
			toast.error("No speech detected in this recording");
		}

		sessionRef.current = null;
		setRecordingId(null);
		setCanRetry(false);
		if (finalText) {
			setError(null);
		}
		setFlowState("idle");
		recorder.resetRecording();
	}, [recorder]);

	const processChunks = useCallback(
		async (
			chunks: Blob[],
			mimeType: string,
			totalDuration: number,
			skipOfflineCheck = false,
		): Promise<boolean> => {
			if (isProcessingRef.current) return false;
			isProcessingRef.current = true;

			const normalizedMimeType = normalizeMimeType(mimeType);
			if (!normalizedMimeType) {
				setFlowState("error");
				setCanRetry(false);
				setError("Invalid audio format");
				toast.error("Invalid audio format");
				isProcessingRef.current = false;
				return false;
			}

			const sanitizedChunks = chunks.filter((chunk) => chunk.size > 0);
			if (
				Number.isFinite(totalDuration) &&
				totalDuration < MIN_RECORDING_SECONDS
			) {
				setFlowState("error");
				setCanRetry(false);
				setError("Recording too short");
				toast.error("Recording too short");
				recorder.resetRecording();
				isProcessingRef.current = false;
				return false;
			}

			if (sanitizedChunks.length === 0) {
				setFlowState("error");
				setCanRetry(false);
				setError("Invalid audio: empty recording");
				toast.error("Invalid audio: empty recording");
				recorder.resetRecording();
				isProcessingRef.current = false;
				return false;
			}

			// Resume flow for in-progress session when retrying.
			const session =
				sessionRef.current ??
				({
					chunks: sanitizedChunks,
					mimeType: normalizedMimeType,
					totalDuration,
					recordingIds: sanitizedChunks.map(() => null),
					transcripts: [],
					failedChunkIndex: null,
				} as DictationSession);
			session.chunks = sanitizedChunks;
			session.mimeType = normalizedMimeType;
			session.totalDuration = totalDuration;
			sessionRef.current = session;

			if (!navigator.onLine && !skipOfflineCheck) {
				await cacheDictation(
					session.chunks,
					session.mimeType,
					session.totalDuration,
				);
				toast.info(
					"You're offline. Recording saved locally — it will be transcribed when you reconnect.",
				);
				setFlowState("idle");
				setError(null);
				setCanRetry(false);
				sessionRef.current = null;
				isProcessingRef.current = false;
				recorder.resetRecording();
				return true;
			}

			const startIndex =
				session.failedChunkIndex !== null ? session.failedChunkIndex : 0;
			session.failedChunkIndex = null;
			session.transcripts = session.transcripts.slice(
				0,
				sanitizedChunks.length,
			);
			while (session.transcripts.length < sanitizedChunks.length) {
				session.transcripts.push("");
			}

			try {
				setFlowState("processing");
				setError(null);
				setCanRetry(false);

				for (
					let index = startIndex;
					index < sanitizedChunks.length;
					index += 1
				) {
					session.failedChunkIndex = index;
					let chunkRecordingId = session.recordingIds[index];
					if (!chunkRecordingId) {
						chunkRecordingId = await uploadChunk(
							sanitizedChunks[index],
							session.mimeType,
						);
						session.recordingIds[index] = chunkRecordingId;
					}

					setRecordingId(chunkRecordingId);
					const transcript = await transcribeChunkWithRetries(chunkRecordingId);
					session.transcripts[index] = transcript;
				}

				session.failedChunkIndex = null;
				setCanRetry(false);
				finalizeSession();
				return true;
			} catch (err) {
				session.failedChunkIndex = session.failedChunkIndex ?? 0;
				const failedRecordingId =
					session.recordingIds[session.failedChunkIndex] ?? null;
				setRecordingId(failedRecordingId);

				let retryCount = 0;
				if (failedRecordingId) {
					const failed = await getRecording(failedRecordingId);
					retryCount = failed?.retryCount ?? 0;
				}

				setCanRetry(retryCount < MAX_RETRY_ATTEMPTS);
				setFlowState("error");
				setError(toErrorMessage(err));
				toast.error(toErrorMessage(err));
				return false;
			} finally {
				isProcessingRef.current = false;
			}
		},
		[
			uploadChunk,
			getRecording,
			transcribeChunkWithRetries,
			finalizeSession,
			recorder,
		],
	);

	const flushPendingDictations = useCallback(async () => {
		if (flushInProgressRef.current || isProcessingRef.current) return;
		if (!navigator.onLine) return;
		if (
			flowStateRef.current === "recording" ||
			flowStateRef.current === "requesting-permission" ||
			flowStateRef.current === "processing"
		) {
			return;
		}

		flushInProgressRef.current = true;
		try {
			const pending = await getPendingDictations();
			for (const entry of pending) {
				try {
					const chunks = getCachedDictationChunks(entry).filter(
						(chunk) => chunk.size > 0,
					);
					const didProcess = await processChunks(
						chunks,
						entry.mimeType,
						entry.duration,
						true,
					);
					if (didProcess) {
						await removeCachedDictation(entry.id);
					}
				} catch (err) {
					// Keep this entry in cache; it'll be retried on next reconnect.
					console.warn("Failed to flush cached dictation", toErrorMessage(err));
				}
			}
		} finally {
			flushInProgressRef.current = false;
		}
	}, [processChunks]);

	const discardRecording = useCallback(() => {
		const idsToDelete = new Set<Id<"audioRecordings">>();
		if (recordingId) {
			idsToDelete.add(recordingId);
		}
		sessionRef.current?.recordingIds.forEach((id) => {
			if (id) idsToDelete.add(id);
		});
		idsToDelete.forEach((id) => {
			void deleteRecording({ id }).catch(() => {});
		});

		sessionRef.current = null;
		setRecordingId(null);
		setCanRetry(false);
		setError(null);
		setFlowState("idle");
		recorder.resetRecording();
	}, [deleteRecording, recorder, recordingId]);

	const retryTranscription = useCallback(() => {
		const session = sessionRef.current;
		if (
			!session ||
			session.failedChunkIndex === null ||
			!canRetry ||
			isProcessingRef.current
		) {
			return;
		}
		processChunks(
			session.chunks,
			session.mimeType,
			session.totalDuration,
			false,
		);
	}, [canRetry, processChunks]);

	const isActiveState =
		flowState === "recording" ||
		flowState === "requesting-permission" ||
		flowState === "processing";

	const startDictation = useCallback(() => {
		if (isActiveState) return;

		setError(null);
		setCanRetry(false);
		sessionRef.current = null;
		recorder.startRecording({ chunkDurationMs: DICTATION_CHUNK_DURATION_MS });
		setFlowState("requesting-permission");
	}, [isActiveState, recorder]);

	const stopDictation = useCallback(() => {
		if (flowState !== "recording") return;
		recorder.stopRecording();
		setFlowState("processing");
	}, [flowState, recorder]);

	useEffect(() => {
		if (recorder.state === "requesting-permission") {
			setFlowState("requesting-permission");
		} else if (recorder.state === "recording") {
			setFlowState("recording");
		} else if (recorder.state === "stopped" && flowState === "recording") {
			setFlowState("processing");
		} else if (
			recorder.state === "idle" &&
			flowState !== "processing" &&
			flowState !== "error"
		) {
			setFlowState("idle");
		}
	}, [flowState, recorder.state]);

	useEffect(() => {
		flowStateRef.current = flowState;
	}, [flowState]);

	useEffect(() => {
		if (recorder.error) {
			setFlowState("error");
			setError(recorder.error);
			toast.error(recorder.error);
		}
	}, [recorder.error]);

	useEffect(() => {
		if (recorder.autoStoppedAtLimit) {
			toast.info(
				"Maximum recording length reached — transcribing your recording.",
			);
		}
	}, [recorder.autoStoppedAtLimit]);

	useEffect(() => {
		if (
			flowState === "processing" &&
			recorder.state === "stopped" &&
			!isProcessingRef.current &&
			recorder.audioChunks.length > 0
		) {
			void processChunks(
				recorder.audioChunks,
				recorder.audioMimeType ?? "",
				recorder.duration,
			);
		}
	}, [
		flowState,
		processChunks,
		recorder.audioChunks,
		recorder.audioMimeType,
		recorder.duration,
		recorder.state,
	]);

	return {
		state: flowState,
		startDictation,
		stopDictation,
		duration: recorder.duration,
		error,
		canRetry,
		retryTranscription,
		discardRecording,
		flushPendingDictations,
	};
}
