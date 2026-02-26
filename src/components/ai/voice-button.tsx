"use client";

import { useAction, useConvex, useMutation } from "convex/react";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface VoiceButtonProps {
	onTranscript: (text: string) => void;
	workspaceId: Id<"workspaces">;
	disabled?: boolean;
}

const VALID_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const MAX_RETRY_COUNT = 3;
const MAX_RECORDING_SECONDS = 20 * 60;
const TRANSCRIPTION_CHUNK_SECONDS = 120;
const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024;
const TRANSCRIPTION_POLL_INTERVAL_MS = 700;
const TRANSCRIPTION_POLL_TIMEOUT_MS = 180_000;

function normalizeMimeType(audioBlob: Blob): string {
	const mimeType = audioBlob.type?.trim().toLowerCase();
	if (VALID_MIME_TYPES.includes(mimeType)) {
		return mimeType;
	}
	if (mimeType.startsWith("audio/webm")) {
		return "audio/webm";
	}
	if (mimeType.startsWith("audio/mp4") || mimeType.startsWith("audio/m4a")) {
		return "audio/mp4";
	}
	return "audio/webm";
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function VoiceButton({
	onTranscript,
	workspaceId,
	disabled,
}: VoiceButtonProps) {
	const convex = useConvex();
	const containerRef = useRef<HTMLDivElement | null>(null);

	const generateUploadUrl = useMutation(api.audioRecordings.generateUploadUrl);
	const createRecording = useMutation(api.audioRecordings.create);
	const deleteRecording = useMutation(api.audioRecordings.deleteRecording);
	const transcribeAudio = useAction(api.ai.transcribe.transcribeAudio);
	const retryTranscription = useAction(api.ai.retryTranscription.retry);

	const toggleRecording = useCallback(() => {
		if (disabled) return;
		const button = containerRef.current?.querySelector("button");
		if (button instanceof HTMLButtonElement) {
			button.click();
		}
	}, [disabled]);

	useEffect(() => {
		function onToggleEvent(event: Event) {
			const dictationEvent = event as CustomEvent<{
				source?: string;
				surface?: "ai-chat" | "document";
			}>;
			if (dictationEvent.detail?.surface === "document") return;

			if (dictationEvent.detail?.surface !== "ai-chat") {
				const active = document.activeElement;
				const isInChatInput =
					active?.closest("[data-ai-chat-input='true']") != null;
				const isInEditor = active?.closest("[data-slate-editor]") != null;
				if (!isInChatInput && isInEditor) return;
			}

			toggleRecording();
		}

		window.addEventListener("clave:dictation-toggle", onToggleEvent);
		return () => {
			window.removeEventListener("clave:dictation-toggle", onToggleEvent);
		};
	}, [toggleRecording]);

	const waitForTerminalTranscription = useCallback(
		async (recordingId: Id<"audioRecordings">) => {
			const deadline = Date.now() + TRANSCRIPTION_POLL_TIMEOUT_MS;
			while (Date.now() <= deadline) {
				const recording = await convex.query(api.audioRecordings.get, {
					id: recordingId,
				});
				if (!recording) return null;
				if (
					recording.status === "transcribed" ||
					recording.status === "failed"
				) {
					return recording;
				}
				await sleep(TRANSCRIPTION_POLL_INTERVAL_MS);
			}
			return null;
		},
		[convex],
	);

	const handleAudioRecorded = useCallback(
		async (audioBlob: Blob): Promise<string> => {
			if (audioBlob.size === 0) {
				toast.error("Invalid audio: empty recording");
				return "";
			}

			if (audioBlob.size > MAX_AUDIO_SIZE_BYTES) {
				toast.error("Recording is too large. Please keep it under 25 MB.");
				return "";
			}

			const mimeType = normalizeMimeType(audioBlob);
			let recordingId: Id<"audioRecordings"> | null = null;

			try {
				const uploadUrl = await generateUploadUrl({ workspaceId });
				const uploadResponse = await fetch(uploadUrl, {
					method: "POST",
					headers: { "Content-Type": mimeType },
					body: audioBlob,
				});

				if (!uploadResponse.ok) {
					throw new Error(
						`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
					);
				}

				const { storageId } = (await uploadResponse.json()) as {
					storageId: Id<"_storage">;
				};

				recordingId = await createRecording({
					workspaceId,
					storageId,
					mimeType,
					fileSize: audioBlob.size,
				});

				await transcribeAudio({ audioRecordingId: recordingId });
				let recording = await waitForTerminalTranscription(recordingId);

				while (
					recording &&
					recording.status === "failed" &&
					recording.retryCount < MAX_RETRY_COUNT
				) {
					await retryTranscription({ audioRecordingId: recordingId });
					recording = await waitForTerminalTranscription(recordingId);
				}

				if (recording?.status === "transcribed" && recording.transcript) {
					void deleteRecording({ id: recordingId }).catch(() => {});
					return recording.transcript;
				}

				throw new Error(recording?.errorMessage ?? "Transcription failed");
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Voice transcription failed";
				const failedRecordingId = recordingId;

				toast.error(message, {
					action: failedRecordingId
						? {
								label: "Delete recording",
								onClick: () => {
									deleteRecording({ id: failedRecordingId })
										.then(() => {
											toast.success("Recording deleted");
										})
										.catch(() => {
											toast.error("Failed to delete recording");
										});
								},
							}
						: undefined,
				});

				return "";
			}
		},
		[
			createRecording,
			deleteRecording,
			generateUploadUrl,
			retryTranscription,
			transcribeAudio,
			waitForTerminalTranscription,
			workspaceId,
		],
	);

	return (
		<div ref={containerRef}>
			<SpeechInput
				onTranscriptionChange={onTranscript}
				onAudioRecorded={handleAudioRecorded}
				preferMediaRecorder
				maxDurationSeconds={MAX_RECORDING_SECONDS}
				chunkDurationSeconds={TRANSCRIPTION_CHUNK_SECONDS}
				onMaxDurationReached={() => {
					toast.info(
						"Maximum recording length (20 min) reached — transcribing your recording.",
					);
				}}
				disabled={disabled}
				aria-label="Voice input"
				title="Voice input (Cmd+Shift+V)"
				className="size-9 rounded-md border border-border/50 bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
			/>
		</div>
	);
}
