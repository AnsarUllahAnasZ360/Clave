"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGlobalDictationOptional } from "@/components/providers/global-dictation-provider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DictationState } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";

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

// ── DictationButton ──────────────────────────────────────────────────────

export function DictationButton() {
	const globalDictation = useGlobalDictationOptional();

	// SSR-safe browser capability detection
	const [isSupported, setIsSupported] = useState(true);
	// Screen reader announcement text
	const [srAnnouncement, setSrAnnouncement] = useState("");
	const prevStateRef = useRef<DictationState>("idle");

	useEffect(() => {
		setIsSupported(
			typeof MediaRecorder !== "undefined" && "mediaDevices" in navigator,
		);
	}, []);

	const state = globalDictation?.state ?? "idle";
	const duration = globalDictation?.duration ?? 0;
	const canRetry = globalDictation?.canRetry ?? false;

	// ── Screen reader announcements ───────────────────────────────────────

	useEffect(() => {
		const prev = prevStateRef.current;
		prevStateRef.current = state;

		if (state === "recording") {
			setSrAnnouncement("Recording started");
		} else if (state === "processing") {
			setSrAnnouncement("Recording stopped, transcribing");
		} else if (
			state === "idle" &&
			(prev === "processing" || prev === "recording")
		) {
			setSrAnnouncement("Transcription complete");
		} else if (state === "error") {
			setSrAnnouncement("Transcription failed");
		}
	}, [state]);

	const handleClick = useCallback(() => {
		if (!isSupported || !globalDictation) return;
		globalDictation.toggleDictation();
	}, [isSupported, globalDictation]);

	// ── Aria label ────────────────────────────────────────────────────────

	let ariaLabel: string;
	if (!isSupported) {
		ariaLabel = "Voice input unavailable — requires a modern browser";
	} else {
		switch (state) {
			case "idle":
				ariaLabel = "Start dictation";
				break;
			case "requesting-permission":
				ariaLabel = "Requesting microphone access";
				break;
			case "recording":
				ariaLabel = "Stop dictation";
				break;
			case "processing":
				ariaLabel = "Transcribing audio";
				break;
			case "error":
				ariaLabel = canRetry ? "Retry transcription" : "Start new recording";
				break;
		}
	}

	// ── Tooltip text ─────────────────────────────────────────────────────

	let tooltipText: string;
	if (!isSupported) {
		tooltipText =
			"Voice input requires a modern browser (Chrome, Firefox, or Safari 14.1+)";
	} else {
		switch (state) {
			case "idle":
				tooltipText = "Dictate (Ctrl+Space)";
				break;
			case "requesting-permission":
				tooltipText = "Requesting microphone...";
				break;
			case "recording":
				tooltipText = "Stop dictation";
				break;
			case "processing":
				tooltipText = "Transcribing...";
				break;
			case "error":
				tooltipText = canRetry ? "Click to retry" : "Click for new recording";
				break;
		}
	}

	const isRecording = state === "recording";
	const isProcessing =
		state === "processing" || state === "requesting-permission";
	const isError = state === "error";
	const isDisabled = isProcessing || !isSupported;

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						disabled={isDisabled}
						aria-label={ariaLabel}
						className={cn(
							"inline-flex cursor-pointer items-center justify-center gap-1 rounded-md text-sm transition-all duration-200",
							"h-8 min-w-8 px-1.5",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							isRecording && [
								"bg-red-500 text-white hover:bg-red-600",
								"animate-[voice-pulse_1.5s_ease-in-out_infinite]",
							],
							isProcessing && "text-muted-foreground cursor-wait opacity-50",
							isError &&
								"text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30",
							!isSupported &&
								"text-muted-foreground opacity-50 cursor-not-allowed",
							!isRecording &&
								!isProcessing &&
								!isError &&
								isSupported &&
								"text-muted-foreground hover:bg-muted hover:text-muted-foreground",
						)}
					>
						{isProcessing ? (
							<Loader2 className="size-4 animate-spin" />
						) : isError ? (
							<MicOff className="size-4" />
						) : (
							<Mic className="size-4" />
						)}

						{isRecording && (
							<>
								<WaveformBars />
								<span className="text-[10px] font-mono tabular-nums">
									{formatDuration(duration)}
								</span>
							</>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{tooltipText}</TooltipContent>
			</Tooltip>

			{/* Screen reader live region — announces state changes */}
			<output aria-live="polite" className="sr-only">
				{srAnnouncement}
			</output>
		</>
	);
}
