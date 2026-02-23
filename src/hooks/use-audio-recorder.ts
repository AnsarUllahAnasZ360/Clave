"use client";

import * as React from "react";

// ── Types ───────────────────────────────────────────────────────────────

export type RecordingState =
	| "idle"
	| "requesting-permission"
	| "recording"
	| "stopped";

export interface AudioRecorderResult {
	/** Current recording state */
	state: RecordingState;
	/** Start recording audio from the microphone */
	startRecording: () => void;
	/** Stop the current recording */
	stopRecording: () => void;
	/** The recorded audio blob (available after stopping) */
	audioBlob: Blob | null;
	/** MIME type of the recorded audio (e.g. "audio/webm;codecs=opus") */
	audioMimeType: string | null;
	/** Recording duration in seconds */
	duration: number;
	/** Error message if recording failed */
	error: string | null;
	/** Reset state back to idle, clearing audio data */
	resetRecording: () => void;
	/** True if the recording was auto-stopped at the maximum length limit */
	autoStoppedAtLimit: boolean;
}

// ── MIME type detection ─────────────────────────────────────────────────

const PREFERRED_MIME_TYPES = [
	"audio/webm;codecs=opus",
	"audio/webm",
	"audio/mp4",
] as const;

function getSupportedMimeType(): string | null {
	if (typeof MediaRecorder === "undefined") return null;
	for (const mimeType of PREFERRED_MIME_TYPES) {
		if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
	}
	return null;
}

// ── Constants ───────────────────────────────────────────────────────────

/** Timeslice for data collection (ms) — enables smooth progress tracking */
const DATA_TIMESLICE_MS = 250;
/** Duration tracking interval (ms) — 250ms reduces re-renders while keeping UI responsive */
const DURATION_INTERVAL_MS = 250;
/** Minimum recording duration in seconds — recordings shorter than this are discarded */
export const MIN_RECORDING_SECONDS = 0.5;
/** Maximum recording duration in seconds — recordings are auto-stopped at this limit */
export const MAX_RECORDING_SECONDS = 20 * 60;

// ── Hook ────────────────────────────────────────────────────────────────

export function useAudioRecorder(): AudioRecorderResult {
	const [state, setState] = React.useState<RecordingState>("idle");
	const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
	const [audioMimeType, setAudioMimeType] = React.useState<string | null>(null);
	const [duration, setDuration] = React.useState(0);
	const [error, setError] = React.useState<string | null>(null);
	const [autoStoppedAtLimit, setAutoStoppedAtLimit] = React.useState(false);

	const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
	const mediaStreamRef = React.useRef<MediaStream | null>(null);
	const chunksRef = React.useRef<Blob[]>([]);
	const durationIntervalRef = React.useRef<ReturnType<
		typeof setInterval
	> | null>(null);
	const startTimeRef = React.useRef<number>(0);
	/** Signals onstop handler to discard the blob (recording was too short) */
	const tooShortRef = React.useRef(false);

	// Clean up media stream tracks
	const cleanupStream = React.useCallback(() => {
		if (mediaStreamRef.current) {
			for (const track of mediaStreamRef.current.getTracks()) {
				track.stop();
			}
			mediaStreamRef.current = null;
		}
	}, []);

	// Clean up duration timer
	const cleanupTimer = React.useCallback(() => {
		if (durationIntervalRef.current !== null) {
			clearInterval(durationIntervalRef.current);
			durationIntervalRef.current = null;
		}
	}, []);

	// Start recording
	const startRecording = React.useCallback(() => {
		if (state === "recording" || state === "requesting-permission") return;

		// Reset previous state
		setError(null);
		setAudioBlob(null);
		setAudioMimeType(null);
		setDuration(0);
		setAutoStoppedAtLimit(false);
		tooShortRef.current = false;
		chunksRef.current = [];

		const mimeType = getSupportedMimeType();
		if (!mimeType) {
			setError("Audio recording is not supported in this browser.");
			return;
		}

		setState("requesting-permission");

		navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((stream) => {
				mediaStreamRef.current = stream;

				const recorder = new MediaRecorder(stream, { mimeType });
				mediaRecorderRef.current = recorder;

				recorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						chunksRef.current.push(event.data);
					}
				};

				recorder.onstop = () => {
					// Discard blob if the recording was too short
					if (tooShortRef.current) {
						tooShortRef.current = false;
						cleanupStream();
						return;
					}
					const blob = new Blob(chunksRef.current, { type: mimeType });
					setAudioBlob(blob);
					setAudioMimeType(mimeType);
					cleanupStream();
					cleanupTimer();
				};

				recorder.onerror = () => {
					setError("Recording failed unexpectedly.");
					setState("idle");
					cleanupStream();
					cleanupTimer();
				};

				// Start recording with timeslice for chunked data collection
				recorder.start(DATA_TIMESLICE_MS);
				setState("recording");

				// Track duration and enforce maximum length
				startTimeRef.current = Date.now();
				durationIntervalRef.current = setInterval(() => {
					const elapsed = (Date.now() - startTimeRef.current) / 1000;
					setDuration(elapsed);

					// Auto-stop at maximum recording length
					if (
						elapsed >= MAX_RECORDING_SECONDS &&
						mediaRecorderRef.current?.state === "recording"
					) {
						cleanupTimer();
						mediaRecorderRef.current.stop();
						setState("stopped");
						setAutoStoppedAtLimit(true);
					}
				}, DURATION_INTERVAL_MS);
			})
			.catch((err: DOMException) => {
				cleanupStream();
				if (
					err.name === "NotAllowedError" ||
					err.name === "PermissionDeniedError"
				) {
					setError(
						"Microphone access was denied. Please allow microphone access and try again.",
					);
				} else if (err.name === "NotFoundError") {
					setError("No microphone found. Please connect a microphone.");
				} else {
					setError(`Microphone error: ${err.message}`);
				}
				setState("idle");
			});
	}, [state, cleanupStream, cleanupTimer]);

	// Stop recording
	const stopRecording = React.useCallback(() => {
		if (state !== "recording" || !mediaRecorderRef.current) return;

		const elapsedSeconds = (Date.now() - startTimeRef.current) / 1000;
		cleanupTimer();

		// Enforce minimum recording duration
		if (elapsedSeconds < MIN_RECORDING_SECONDS) {
			tooShortRef.current = true;
			setError("Recording too short (minimum 0.5 seconds)");
			mediaRecorderRef.current.stop();
			setState("idle");
			return;
		}

		// Final duration snapshot before stopping
		setDuration(elapsedSeconds);
		mediaRecorderRef.current.stop();
		setState("stopped");
	}, [state, cleanupTimer]);

	// Reset to idle
	const resetRecording = React.useCallback(() => {
		// Stop any in-progress recording
		if (
			mediaRecorderRef.current &&
			mediaRecorderRef.current.state !== "inactive"
		) {
			mediaRecorderRef.current.stop();
		}
		cleanupStream();
		cleanupTimer();

		mediaRecorderRef.current = null;
		chunksRef.current = [];
		startTimeRef.current = 0;
		tooShortRef.current = false;

		setState("idle");
		setAudioBlob(null);
		setAudioMimeType(null);
		setDuration(0);
		setError(null);
		setAutoStoppedAtLimit(false);
	}, [cleanupStream, cleanupTimer]);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => {
			if (
				mediaRecorderRef.current &&
				mediaRecorderRef.current.state !== "inactive"
			) {
				mediaRecorderRef.current.stop();
			}
			cleanupStream();
			cleanupTimer();
		};
	}, [cleanupStream, cleanupTimer]);

	return {
		state,
		startRecording,
		stopRecording,
		audioBlob,
		audioMimeType,
		duration,
		error,
		resetRecording,
		autoStoppedAtLimit,
	};
}
