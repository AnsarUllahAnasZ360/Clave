"use client";

/**
 * Headless bridge that connects dictation to any Plate editor with AIEditorPlugin.
 *
 * Must be rendered inside a `<Plate>` context (via EditorAIBridge).
 *
 * Listens for:
 * - "clave:dictation-toggle" custom events (from Cmd+Shift+V shortcut or slash command)
 *
 * Scopes activation to the editor that currently has focus, preventing
 * multiple DictationBridge instances from activating simultaneously.
 *
 * Renders a floating recording indicator (portal) when active.
 */

import { Loader2, Mic } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDictation } from "@/hooks/use-dictation";
import type { Id } from "../../../../convex/_generated/dataModel";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function WaveformBars() {
	return (
		<div className="flex items-center gap-[2px] h-3">
			{[0, 150, 300].map((delay) => (
				<div
					key={delay}
					className="w-[2px] rounded-full bg-current"
					style={{
						animation: `voice-waveform 0.8s ease-in-out ${delay}ms infinite`,
						height: "30%",
					}}
				/>
			))}
		</div>
	);
}

// ── Component ───────────────────────────────────────────────────────────────

interface DictationBridgeProps {
	workspaceId: string;
}

export function DictationBridge({ workspaceId }: DictationBridgeProps) {
	const editor = useEditorRef();
	const editorElRef = useRef<HTMLElement | null>(null);
	const [isSupported, setIsSupported] = useState(true);

	// Resolve the editor DOM node once
	useEffect(() => {
		try {
			const el = editor.api.toDOMNode(editor) as HTMLElement | undefined;
			editorElRef.current = el ?? null;
		} catch {
			editorElRef.current = null;
		}
	}, [editor]);

	useEffect(() => {
		setIsSupported(
			typeof MediaRecorder !== "undefined" && "mediaDevices" in navigator,
		);
	}, []);

	const handleTranscript = useCallback(
		(text: string) => {
			editor.tf.focus();
			editor.tf.insertText(text);
		},
		[editor],
	);

	const {
		state,
		startDictation,
		stopDictation,
		duration,
		canRetry,
		retryTranscription,
		discardRecording,
	} = useDictation({
		workspaceId: workspaceId as Id<"workspaces">,
		onTranscript: handleTranscript,
	});

	// Listen for global dictation toggle events, scoped to this editor
	useEffect(() => {
		if (!isSupported) return;

		function isOurEditor(): boolean {
			const active = document.activeElement;
			const slateEl = active?.closest("[data-slate-editor]");
			return slateEl != null && slateEl === editorElRef.current;
		}

		function handleDictationToggle() {
			if (!isOurEditor()) return;

			if (state === "idle") {
				startDictation();
			} else if (state === "recording") {
				stopDictation();
			} else if (state === "error" && canRetry) {
				retryTranscription();
			} else if (state === "error" && !canRetry) {
				discardRecording();
				startDictation();
			}
		}

		window.addEventListener("clave:dictation-toggle", handleDictationToggle);
		return () =>
			window.removeEventListener(
				"clave:dictation-toggle",
				handleDictationToggle,
			);
	}, [
		state,
		isSupported,
		canRetry,
		discardRecording,
		startDictation,
		stopDictation,
		retryTranscription,
	]);

	// Only render the floating indicator when recording or processing
	const isActive = state === "recording" || state === "processing";
	if (!isActive || typeof document === "undefined") return null;

	const indicator = (
		<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-200">
			<div className="flex items-center gap-2 rounded-full border bg-popover px-4 py-2 shadow-lg">
				{state === "recording" ? (
					<>
						<span className="relative flex size-2.5">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
							<span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
						</span>
						<WaveformBars />
						<span className="text-xs font-mono tabular-nums text-foreground">
							{formatDuration(duration)}
						</span>
						<button
							type="button"
							onClick={stopDictation}
							className="ml-1 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors"
							aria-label="Stop recording"
						>
							<Mic className="size-3.5" />
						</button>
					</>
				) : (
					<>
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground">
							Transcribing...
						</span>
					</>
				)}
			</div>
		</div>
	);

	return createPortal(indicator, document.body);
}
