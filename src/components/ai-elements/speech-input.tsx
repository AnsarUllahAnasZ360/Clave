"use client";

import { MicIcon, SquareIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface SpeechRecognition extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
	onend: ((this: SpeechRecognition, ev: Event) => void) | null;
	onresult:
		| ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
		| null;
	onerror:
		| ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
		| null;
}

interface SpeechRecognitionEvent extends Event {
	results: SpeechRecognitionResultList;
	resultIndex: number;
}

interface SpeechRecognitionResultList {
	readonly length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	readonly length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
	isFinal: boolean;
}

interface SpeechRecognitionAlternative {
	transcript: string;
	confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
}

declare global {
	interface Window {
		SpeechRecognition: new () => SpeechRecognition;
		webkitSpeechRecognition: new () => SpeechRecognition;
	}
}

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

export type SpeechInputProps = ComponentProps<typeof Button> & {
	onTranscriptionChange?: (text: string) => void;
	/**
	 * Callback for when audio is recorded using MediaRecorder fallback.
	 * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
	 * The callback receives an audio Blob that should be sent to a transcription service.
	 * Return the transcribed text, which will be passed to onTranscriptionChange.
	 */
	onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
	lang?: string;
	/** Force MediaRecorder mode even when browser speech recognition is available. */
	preferMediaRecorder?: boolean;
	/** Auto-stop recording after this many seconds (MediaRecorder mode only). */
	maxDurationSeconds?: number;
	/**
	 * Optional chunking interval for MediaRecorder mode.
	 * When set, each chunk is transcribed sequentially and merged.
	 */
	chunkDurationSeconds?: number;
	/** Called when maxDurationSeconds auto-stop is reached. */
	onMaxDurationReached?: () => void;
};

const detectSpeechInputMode = (): SpeechInputMode => {
	if (typeof window === "undefined") {
		return "none";
	}

	if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
		return "speech-recognition";
	}

	if ("MediaRecorder" in window && "mediaDevices" in navigator) {
		return "media-recorder";
	}

	return "none";
};

export const SpeechInput = ({
	className,
	onTranscriptionChange,
	onAudioRecorded,
	lang = "en-US",
	preferMediaRecorder = false,
	maxDurationSeconds,
	chunkDurationSeconds,
	onMaxDurationReached,
	...props
}: SpeechInputProps) => {
	const [isListening, setIsListening] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [detectedMode] = useState<SpeechInputMode>(detectSpeechInputMode);
	const [isRecognitionReady, setIsRecognitionReady] = useState(false);
	const mode = useMemo<SpeechInputMode>(() => {
		if (preferMediaRecorder && detectedMode === "speech-recognition") {
			return "media-recorder";
		}
		return detectedMode;
	}, [detectedMode, preferMediaRecorder]);
	const recognitionRef = useRef<SpeechRecognition | null>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const audioChunksRef = useRef<Blob[]>([]);
	const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const onTranscriptionChangeRef = useRef<
		SpeechInputProps["onTranscriptionChange"]
	>(onTranscriptionChange);
	const onAudioRecordedRef =
		useRef<SpeechInputProps["onAudioRecorded"]>(onAudioRecorded);

	// Keep refs in sync
	onTranscriptionChangeRef.current = onTranscriptionChange;
	onAudioRecordedRef.current = onAudioRecorded;

	// Initialize Speech Recognition when mode is speech-recognition
	useEffect(() => {
		if (mode !== "speech-recognition") {
			return;
		}

		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;
		const speechRecognition = new SpeechRecognition();

		speechRecognition.continuous = true;
		speechRecognition.interimResults = true;
		speechRecognition.lang = lang;

		const handleStart = () => {
			setIsListening(true);
		};

		const handleEnd = () => {
			setIsListening(false);
		};

		const handleResult = (event: Event) => {
			const speechEvent = event as SpeechRecognitionEvent;
			let finalTranscript = "";

			for (
				let i = speechEvent.resultIndex;
				i < speechEvent.results.length;
				i += 1
			) {
				const result = speechEvent.results[i];
				if (result.isFinal) {
					finalTranscript += result[0]?.transcript ?? "";
				}
			}

			if (finalTranscript) {
				onTranscriptionChangeRef.current?.(finalTranscript);
			}
		};

		const handleError = () => {
			setIsListening(false);
		};

		speechRecognition.addEventListener("start", handleStart);
		speechRecognition.addEventListener("end", handleEnd);
		speechRecognition.addEventListener("result", handleResult);
		speechRecognition.addEventListener("error", handleError);

		recognitionRef.current = speechRecognition;
		setIsRecognitionReady(true);

		return () => {
			speechRecognition.removeEventListener("start", handleStart);
			speechRecognition.removeEventListener("end", handleEnd);
			speechRecognition.removeEventListener("result", handleResult);
			speechRecognition.removeEventListener("error", handleError);
			speechRecognition.stop();
			recognitionRef.current = null;
			setIsRecognitionReady(false);
		};
	}, [mode, lang]);

	// Cleanup MediaRecorder and stream on unmount
	useEffect(
		() => () => {
			if (mediaRecorderRef.current?.state === "recording") {
				mediaRecorderRef.current.stop();
			}
			if (streamRef.current) {
				for (const track of streamRef.current.getTracks()) {
					track.stop();
				}
			}
			if (maxDurationTimeoutRef.current) {
				clearTimeout(maxDurationTimeoutRef.current);
				maxDurationTimeoutRef.current = null;
			}
		},
		[],
	);

	// Start MediaRecorder recording
	const startMediaRecorder = useCallback(async () => {
		if (!onAudioRecordedRef.current) {
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			const mediaRecorder = new MediaRecorder(stream);
			audioChunksRef.current = [];

			const handleDataAvailable = (event: BlobEvent) => {
				if (event.data.size > 0) {
					audioChunksRef.current.push(event.data);
				}
			};

			const handleStop = async () => {
				if (maxDurationTimeoutRef.current) {
					clearTimeout(maxDurationTimeoutRef.current);
					maxDurationTimeoutRef.current = null;
				}
				for (const track of stream.getTracks()) {
					track.stop();
				}
				streamRef.current = null;

				const transcriptionChunks = audioChunksRef.current.filter(
					(chunk) => chunk.size > 0,
				);
				const shouldChunkTranscription =
					Number.isFinite(chunkDurationSeconds) &&
					(chunkDurationSeconds ?? 0) > 0;

				if (transcriptionChunks.length > 0 && onAudioRecordedRef.current) {
					setIsProcessing(true);
					try {
						if (shouldChunkTranscription) {
							const transcriptParts: string[] = [];
							for (const chunk of transcriptionChunks) {
								const chunkTranscript = (
									await onAudioRecordedRef.current(chunk)
								).trim();
								if (chunkTranscript) {
									transcriptParts.push(chunkTranscript);
								}
							}
							const mergedTranscript = transcriptParts.join(" ").trim();
							if (mergedTranscript) {
								onTranscriptionChangeRef.current?.(mergedTranscript);
							}
						} else {
							const audioBlob = new Blob(transcriptionChunks, {
								type: transcriptionChunks[0]?.type || "audio/webm",
							});
							const transcript = await onAudioRecordedRef.current(audioBlob);
							if (transcript) {
								onTranscriptionChangeRef.current?.(transcript);
							}
						}
					} catch {
						// Error handling delegated to the onAudioRecorded caller
					} finally {
						setIsProcessing(false);
					}
				}
			};

			const handleError = () => {
				setIsListening(false);
				if (maxDurationTimeoutRef.current) {
					clearTimeout(maxDurationTimeoutRef.current);
					maxDurationTimeoutRef.current = null;
				}
				for (const track of stream.getTracks()) {
					track.stop();
				}
				streamRef.current = null;
			};

			mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
			mediaRecorder.addEventListener("stop", handleStop);
			mediaRecorder.addEventListener("error", handleError);

			mediaRecorderRef.current = mediaRecorder;
			const timesliceMs =
				Number.isFinite(chunkDurationSeconds) && (chunkDurationSeconds ?? 0) > 0
					? Math.round((chunkDurationSeconds ?? 0) * 1000)
					: null;
			if (timesliceMs && timesliceMs > 0) {
				mediaRecorder.start(timesliceMs);
			} else {
				mediaRecorder.start();
			}
			setIsListening(true);

			if (maxDurationSeconds && Number.isFinite(maxDurationSeconds)) {
				maxDurationTimeoutRef.current = setTimeout(() => {
					if (mediaRecorder.state === "recording") {
						mediaRecorder.stop();
						setIsListening(false);
						onMaxDurationReached?.();
					}
				}, maxDurationSeconds * 1000);
			}
		} catch {
			setIsListening(false);
		}
	}, [chunkDurationSeconds, maxDurationSeconds, onMaxDurationReached]);

	// Stop MediaRecorder recording
	const stopMediaRecorder = useCallback(() => {
		if (maxDurationTimeoutRef.current) {
			clearTimeout(maxDurationTimeoutRef.current);
			maxDurationTimeoutRef.current = null;
		}
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
		setIsListening(false);
	}, []);

	const toggleListening = useCallback(() => {
		if (mode === "speech-recognition" && recognitionRef.current) {
			if (isListening) {
				recognitionRef.current.stop();
			} else {
				recognitionRef.current.start();
			}
		} else if (mode === "media-recorder") {
			if (isListening) {
				stopMediaRecorder();
			} else {
				startMediaRecorder();
			}
		}
	}, [mode, isListening, startMediaRecorder, stopMediaRecorder]);

	// Determine if button should be disabled
	const isDisabled =
		mode === "none" ||
		(mode === "speech-recognition" && !isRecognitionReady) ||
		(mode === "media-recorder" && !onAudioRecorded) ||
		isProcessing;

	return (
		<div className="relative inline-flex items-center justify-center">
			{/* Animated pulse rings */}
			{isListening &&
				[0, 1, 2].map((index) => (
					<div
						className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
						key={index}
						style={{
							animationDelay: `${index * 0.3}s`,
							animationDuration: "2s",
						}}
					/>
				))}

			{/* Main record button */}
			<Button
				className={cn(
					"relative z-10 rounded-full transition-all duration-300",
					isListening
						? "bg-destructive text-white hover:bg-destructive/80 hover:text-white"
						: "bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground",
					className,
				)}
				disabled={isDisabled}
				onClick={toggleListening}
				{...props}
			>
				{isProcessing && <Spinner />}
				{!isProcessing && isListening && <SquareIcon className="size-4" />}
				{!(isProcessing || isListening) && <MicIcon className="size-4" />}
			</Button>
		</div>
	);
};
