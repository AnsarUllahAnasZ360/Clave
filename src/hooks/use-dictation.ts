"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
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
	/** True when the failed recording can still be retried (retryCount < 3) */
	canRetry: boolean;
	/** Retry transcription for the current failed recording (does not re-upload audio) */
	retryTranscription: () => void;
	/** Delete the current recording (best-effort) and reset local dictation state */
	discardRecording: () => void;
}

// ── Valid MIME types for upload validation ───────────────────────────────

const VALID_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

// ── Hook ─────────────────────────────────────────────────────────────────

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

	// Convex mutations/actions
	const generateUploadUrl = useMutation(api.audioRecordings.generateUploadUrl);
	const createRecording = useMutation(api.audioRecordings.create);
	const deleteRecording = useMutation(api.audioRecordings.deleteRecording);
	const transcribeAudio = useAction(api.ai.transcribe.transcribeAudio);
	const retryTranscriptionAction = useAction(api.ai.retryTranscription.retry);

	// Reactive query for recording status
	const recording = useQuery(
		api.audioRecordings.get,
		recordingId ? { id: recordingId } : "skip",
	);

	// Stable ref for onTranscript to avoid re-triggering effects
	const onTranscriptRef = useRef(onTranscript);
	onTranscriptRef.current = onTranscript;

	// Derived retry state — retryCount increments on each failure in markFailed
	const recordingRetryCount = recording?.retryCount ?? 0;
	const canRetry = recordingId !== null && recordingRetryCount < 3;

	// ── Derive flow state from recorder state ────────────────────────────

	useEffect(() => {
		if (recorder.state === "requesting-permission") {
			setFlowState("requesting-permission");
		} else if (recorder.state === "recording") {
			setFlowState("recording");
		}
	}, [recorder.state]);

	// ── Handle recorder errors ───────────────────────────────────────────

	useEffect(() => {
		if (recorder.error) {
			setFlowState("error");
			setError(recorder.error);
			toast.error(recorder.error);
		}
	}, [recorder.error]);

	// ── Notify when recording auto-stopped at the time limit ─────────────

	useEffect(() => {
		if (recorder.autoStoppedAtLimit) {
			toast.info(
				"Maximum recording length reached — transcribing your recording.",
			);
		}
	}, [recorder.autoStoppedAtLimit]);

	// ── Upload + transcribe flow ─────────────────────────────────────────

	const hasTriggeredUploadRef = useRef(false);

	useEffect(() => {
		if (!recorder.audioBlob || !recorder.audioMimeType) return;
		if (hasTriggeredUploadRef.current) return;
		hasTriggeredUploadRef.current = true;

		// Validate audio before upload
		if (recorder.audioBlob.size === 0) {
			setFlowState("error");
			const msg = "Invalid audio: empty recording";
			setError(msg);
			toast.error(msg);
			return;
		}
		if (!VALID_MIME_TYPES.includes(recorder.audioMimeType)) {
			setFlowState("error");
			const msg = "Invalid audio format";
			setError(msg);
			toast.error(msg);
			return;
		}

		setFlowState("processing");

		(async () => {
			try {
				const uploadUrl = await generateUploadUrl({ workspaceId });

				const uploadResponse = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": recorder.audioMimeType as string },
					body: recorder.audioBlob,
				});

				if (!uploadResponse.ok) {
					throw new Error(
						`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
					);
				}

				const { storageId } = (await uploadResponse.json()) as {
					storageId: Id<"_storage">;
				};

				const newRecordingId = await createRecording({
					workspaceId,
					storageId,
					mimeType: recorder.audioMimeType as string,
					duration: recorder.duration,
					fileSize: recorder.audioBlob?.size,
				});

				setRecordingId(newRecordingId);

				await transcribeAudio({ audioRecordingId: newRecordingId });
			} catch (err) {
				setFlowState("error");
				const msg =
					err instanceof Error
						? err.message
						: "Failed to upload audio recording";
				setError(msg);
				toast.error(msg);
			}
		})();
	}, [
		recorder.audioBlob,
		recorder.audioMimeType,
		recorder.duration,
		generateUploadUrl,
		createRecording,
		transcribeAudio,
		workspaceId,
	]);

	// ── React to transcription status changes ────────────────────────────

	const recordingStatus = recording?.status;
	const recordingTranscript = recording?.transcript;
	const recordingErrorMessage = recording?.errorMessage;

	useEffect(() => {
		if (!recordingStatus) return;

		if (recordingStatus === "transcribed" && recordingTranscript) {
			onTranscriptRef.current(recordingTranscript);
			// Best-effort cleanup to avoid recording buildup in storage.
			if (recordingId) {
				void deleteRecording({ id: recordingId }).catch(() => {});
			}
			// Reset everything
			setFlowState("idle");
			setRecordingId(null);
			setError(null);
			hasTriggeredUploadRef.current = false;
			recorder.resetRecording();
		} else if (recordingStatus === "failed") {
			setFlowState("error");
			const msg = recordingErrorMessage ?? "Transcription failed";
			setError(msg);

			if (recordingRetryCount >= 3) {
				// Max retries reached — prompt user to record again
				toast.error("Transcription failed after 3 attempts.", {
					action: recordingId
						? {
								label: "Delete recording",
								onClick: () => {
									deleteRecording({ id: recordingId })
										.then(() => {
											setRecordingId(null);
											setFlowState("idle");
											setError(null);
											hasTriggeredUploadRef.current = false;
											recorder.resetRecording();
											toast.success("Recording deleted");
										})
										.catch((deleteErr) => {
											const deleteMsg =
												deleteErr instanceof Error
													? deleteErr.message
													: "Failed to delete recording";
											toast.error(deleteMsg);
										});
								},
							}
						: undefined,
				});
			} else {
				toast.error(msg, {
					action: recordingId
						? {
								label: "Retry",
								onClick: () => {
									setFlowState("processing");
									retryTranscriptionAction({
										audioRecordingId: recordingId,
									}).catch((err) => {
										setFlowState("error");
										const retryMsg =
											err instanceof Error
												? err.message
												: "Retry failed. Please try recording again.";
										setError(retryMsg);
										toast.error(retryMsg);
									});
								},
							}
						: undefined,
				});
			}
		}
	}, [
		recordingStatus,
		recordingTranscript,
		recordingErrorMessage,
		recordingRetryCount,
		recorder,
		recordingId,
		deleteRecording,
		retryTranscriptionAction,
	]);

	// ── Public retry function ────────────────────────────────────────────

	const retryTranscription = useCallback(() => {
		if (!recordingId || !canRetry) return;
		setFlowState("processing");
		retryTranscriptionAction({ audioRecordingId: recordingId }).catch((err) => {
			setFlowState("error");
			const msg =
				err instanceof Error
					? err.message
					: "Retry failed. Please try recording again.";
			setError(msg);
			toast.error(msg);
		});
	}, [recordingId, canRetry, retryTranscriptionAction]);

	const discardRecording = useCallback(() => {
		if (recordingId) {
			void deleteRecording({ id: recordingId }).catch(() => {});
		}
		setRecordingId(null);
		setFlowState("idle");
		setError(null);
		hasTriggeredUploadRef.current = false;
		recorder.resetRecording();
	}, [recordingId, deleteRecording, recorder]);

	// ── Public API ───────────────────────────────────────────────────────

	const startDictation = useCallback(() => {
		if (
			flowState === "recording" ||
			flowState === "requesting-permission" ||
			flowState === "processing"
		)
			return;
		hasTriggeredUploadRef.current = false;
		setError(null);
		recorder.startRecording();
	}, [flowState, recorder]);

	const stopDictation = useCallback(() => {
		if (flowState !== "recording") return;
		recorder.stopRecording();
	}, [flowState, recorder]);

	return {
		state: flowState,
		startDictation,
		stopDictation,
		duration: recorder.duration,
		error,
		canRetry,
		retryTranscription,
		discardRecording,
	};
}
