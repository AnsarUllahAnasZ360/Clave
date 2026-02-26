"use client";

/**
 * Global dictation provider — owns the single useDictation instance for
 * the entire workspace. Routes transcripts to the active element at
 * recording-start time, and shows a completion message in the indicator.
 */

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import {
	DictationRecordingIndicator,
	type IndicatorState,
} from "@/components/ai/DictationRecordingIndicator";
import { useWorkspace } from "@/components/providers/workspace-context";
import { type DictationState, useDictation } from "@/hooks/use-dictation";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Context ──────────────────────────────────────────────────────────────

interface GlobalDictationContextValue {
	state: DictationState;
	startDictation: () => void;
	stopDictation: () => void;
	toggleDictation: () => void;
	duration: number;
	error: string | null;
	canRetry: boolean;
	retryTranscription: () => void;
	discardRecording: () => void;
}

const GlobalDictationCtx = createContext<GlobalDictationContextValue | null>(
	null,
);

export function useGlobalDictation(): GlobalDictationContextValue {
	const ctx = useContext(GlobalDictationCtx);
	if (!ctx) {
		throw new Error(
			"useGlobalDictation must be used within a GlobalDictationProvider",
		);
	}
	return ctx;
}

export function useGlobalDictationOptional(): GlobalDictationContextValue | null {
	return useContext(GlobalDictationCtx);
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Snapshot of the target element at recording-start time. */
interface CapturedTarget {
	element: Element;
	slateEditor: Element | null;
	aiChatInput: Element | null;
}

function captureTarget(): CapturedTarget {
	const element = document.activeElement ?? document.body;
	return {
		element,
		slateEditor: element.closest("[data-slate-editor]"),
		aiChatInput: element.closest("[data-ai-chat-input='true']"),
	};
}

/** How long the "completed" indicator stays visible (ms). */
const COMPLETED_DISPLAY_MS = 2500;

// ── Provider ─────────────────────────────────────────────────────────────

export function GlobalDictationProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { workspaceId } = useWorkspace();
	const capturedTargetRef = useRef<CapturedTarget | null>(null);

	// Completion state: message shown in indicator after transcription
	const [completedMessage, setCompletedMessage] = useState<string | null>(null);
	const completedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	/** Show a completion message in the indicator for COMPLETED_DISPLAY_MS. */
	const showCompleted = useCallback((message: string) => {
		if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
		setCompletedMessage(message);
		completedTimerRef.current = setTimeout(() => {
			setCompletedMessage(null);
			completedTimerRef.current = null;
		}, COMPLETED_DISPLAY_MS);
	}, []);

	// Clean up timer on unmount
	useEffect(() => {
		return () => {
			if (completedTimerRef.current) clearTimeout(completedTimerRef.current);
		};
	}, []);

	// Route transcript to the captured active element
	const handleTranscript = useCallback(
		(text: string) => {
			const captured = capturedTargetRef.current;
			const target = captured?.element;

			// 1. Slate/Plate editor
			if (captured?.slateEditor) {
				window.dispatchEvent(
					new CustomEvent("clave:dictation-transcript", {
						detail: { text, targetEditor: captured.slateEditor },
					}),
				);
				showCompleted("Inserted into document");
				return;
			}

			// 2. AI chat input
			if (captured?.aiChatInput) {
				const chatTextarea =
					captured.aiChatInput.querySelector("textarea") ??
					captured.aiChatInput.querySelector("input");
				if (chatTextarea) {
					chatTextarea.focus();
					document.execCommand("insertText", false, text);
					showCompleted("Inserted into chat");
					return;
				}
			}

			// 3. Standard input/textarea
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement
			) {
				target.focus();
				document.execCommand("insertText", false, text);
				showCompleted("Inserted into field");
				return;
			}

			// 4. ContentEditable element
			if (target instanceof HTMLElement && target.isContentEditable) {
				target.focus();
				document.execCommand("insertText", false, text);
				showCompleted("Text inserted");
				return;
			}

			// 5. No text field — copy to clipboard
			void navigator.clipboard
				.writeText(text)
				.then(() => {
					showCompleted("Copied to clipboard");
				})
				.catch(() => {
					showCompleted("Copied to clipboard");
				});
		},
		[showCompleted],
	);

	const dictation = useDictation({
		workspaceId: workspaceId as Id<"workspaces">,
		onTranscript: handleTranscript,
	});

	// Capture active element when starting — also clear any lingering completion
	const startDictation = useCallback(() => {
		setCompletedMessage(null);
		if (completedTimerRef.current) {
			clearTimeout(completedTimerRef.current);
			completedTimerRef.current = null;
		}
		capturedTargetRef.current = captureTarget();
		dictation.startDictation();
	}, [dictation]);

	const toggleDictation = useCallback(() => {
		if (dictation.state === "idle" || dictation.state === "error") {
			setCompletedMessage(null);
			if (completedTimerRef.current) {
				clearTimeout(completedTimerRef.current);
				completedTimerRef.current = null;
			}
			capturedTargetRef.current = captureTarget();
			if (dictation.state === "error") {
				if (dictation.canRetry) {
					dictation.retryTranscription();
					return;
				}
				dictation.discardRecording();
			}
			dictation.startDictation();
		} else if (dictation.state === "recording") {
			dictation.stopDictation();
		}
	}, [dictation]);

	// Listen for global toggle event
	useEffect(() => {
		function handleToggleEvent(event: Event) {
			const detail = (
				event as CustomEvent<{ source?: string; surface?: string }>
			).detail;
			if (detail?.surface === "document") return;
			toggleDictation();
		}

		window.addEventListener("clave:dictation-toggle", handleToggleEvent);
		return () =>
			window.removeEventListener("clave:dictation-toggle", handleToggleEvent);
	}, [toggleDictation]);

	// Flush pending offline dictations on mount + reconnect
	useEffect(() => {
		void dictation.flushPendingDictations();

		const handleOnline = () => {
			void dictation.flushPendingDictations();
		};

		window.addEventListener("online", handleOnline);
		return () => {
			window.removeEventListener("online", handleOnline);
		};
	}, [dictation.flushPendingDictations]);

	// Determine indicator visibility and state
	const isDictationActive =
		dictation.state === "requesting-permission" ||
		dictation.state === "recording" ||
		dictation.state === "processing";
	const showIndicator = isDictationActive || completedMessage !== null;

	let indicatorState: IndicatorState = "recording";
	if (completedMessage && !isDictationActive) {
		indicatorState = "completed";
	} else if (dictation.state === "requesting-permission") {
		indicatorState = "requesting-permission";
	} else if (dictation.state === "recording") {
		indicatorState = "recording";
	} else if (dictation.state === "processing") {
		indicatorState = "processing";
	}

	const value: GlobalDictationContextValue = {
		state: dictation.state,
		startDictation,
		stopDictation: dictation.stopDictation,
		toggleDictation,
		duration: dictation.duration,
		error: dictation.error,
		canRetry: dictation.canRetry,
		retryTranscription: dictation.retryTranscription,
		discardRecording: dictation.discardRecording,
	};

	return (
		<GlobalDictationCtx.Provider value={value}>
			{children}
			{showIndicator &&
				typeof document !== "undefined" &&
				createPortal(
					<DictationRecordingIndicator
						state={indicatorState}
						duration={dictation.duration}
						onDone={dictation.stopDictation}
						completedMessage={completedMessage ?? undefined}
					/>,
					document.body,
				)}
		</GlobalDictationCtx.Provider>
	);
}
