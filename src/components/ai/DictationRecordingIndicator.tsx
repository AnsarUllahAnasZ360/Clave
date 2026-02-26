"use client";

import { Check, ClipboardCheck, Loader2 } from "lucide-react";

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

// ── Component ────────────────────────────────────────────────────────────

export type IndicatorState =
	| "requesting-permission"
	| "recording"
	| "processing"
	| "completed";

interface DictationRecordingIndicatorProps {
	state: IndicatorState;
	duration: number;
	onDone: () => void;
	/** Message shown in the completed state, e.g. "Copied to clipboard" */
	completedMessage?: string;
}

export function DictationRecordingIndicator({
	state,
	duration,
	onDone,
	completedMessage,
}: DictationRecordingIndicatorProps) {
	const isCompleted = state === "completed";

	return (
		<div
			className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] animate-in fade-in slide-in-from-bottom-2 duration-200 ${
				isCompleted
					? "animate-out fade-out slide-out-to-bottom-2 fill-mode-forwards delay-[1800ms]"
					: ""
			}`}
		>
			<div
				className={`flex items-center gap-2 rounded-full border px-4 py-2 shadow-lg transition-colors duration-300 ${
					isCompleted ? "border-green-500/30 bg-green-950/80" : "bg-popover"
				}`}
			>
				{state === "completed" ? (
					<>
						<ClipboardCheck className="size-4 text-green-400" />
						<span className="text-xs font-medium text-green-300">
							{completedMessage || "Done"}
						</span>
					</>
				) : state === "recording" ? (
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
							onClick={onDone}
							className="ml-1 rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600 transition-colors"
							aria-label="Done — stop and transcribe"
						>
							<Check className="size-3.5" />
						</button>
					</>
				) : state === "requesting-permission" ? (
					<>
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground">
							Requesting microphone...
						</span>
					</>
				) : (
					<>
						<Loader2 className="size-4 animate-spin text-muted-foreground" />
						<span className="text-xs text-muted-foreground">
							Transcribing recording...
						</span>
					</>
				)}
			</div>
		</div>
	);
}
