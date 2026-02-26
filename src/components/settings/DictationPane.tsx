"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
	CheckCircle2,
	Clock,
	Copy,
	Loader2,
	Mic,
	Play,
	RefreshCw,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PaneDescription, PaneTitle, SettingSection } from "./settings-shared";

// ── Helpers ──────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const seconds = Math.floor(diff / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function formatDuration(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	if (mins === 0) return `${secs}s`;
	return `${mins}m ${secs}s`;
}

// ── Pane ─────────────────────────────────────────────────────────────────

export function DictationClipboardPane() {
	const recordings = useQuery(api.audioRecordings.listByUser);
	const deleteRecording = useMutation(api.audioRecordings.deleteRecording);
	const retryTranscription = useAction(api.ai.retryTranscription.retry);

	return (
		<div className="space-y-6">
			<div className="space-y-1">
				<PaneTitle>Dictation</PaneTitle>
				<PaneDescription>
					Your recent voice recordings and transcripts. Press Ctrl+Space to
					start a new dictation.
				</PaneDescription>
			</div>

			<SettingSection title="History">
				{recordings === undefined ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : recordings.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
						<Mic className="size-8 text-muted-foreground/50" />
						<p className="text-sm text-muted-foreground">
							No dictations yet. Press Ctrl+Space to start.
						</p>
					</div>
				) : (
					<ScrollArea className="max-h-[600px]">
						<div className="space-y-2">
							{recordings.map((recording) => (
								<DictationEntry
									key={recording._id}
									recording={recording}
									onDelete={async (id) => {
										await deleteRecording({ id });
										toast.success("Recording deleted");
									}}
									onRetry={async (id) => {
										await retryTranscription({ audioRecordingId: id });
										toast.success("Retrying transcription...");
									}}
								/>
							))}
						</div>
					</ScrollArea>
				)}
			</SettingSection>
		</div>
	);
}

// ── Entry ────────────────────────────────────────────────────────────────

function StatusIndicator({ status }: { status: string }) {
	switch (status) {
		case "transcribed":
			return <CheckCircle2 className="size-3.5 text-green-500" />;
		case "transcribing":
			return <Loader2 className="size-3.5 animate-spin text-yellow-500" />;
		case "failed":
			return <XCircle className="size-3.5 text-red-500" />;
		default:
			return <Clock className="size-3.5 text-muted-foreground" />;
	}
}

interface DictationEntryProps {
	recording: {
		_id: Id<"audioRecordings">;
		status: string;
		transcript?: string;
		duration?: number;
		createdAt: number;
		errorMessage?: string;
		audioCleanedAt?: number;
		storageId?: Id<"_storage"> | null;
		retryCount: number;
	};
	onDelete: (id: Id<"audioRecordings">) => Promise<void>;
	onRetry: (id: Id<"audioRecordings">) => Promise<void>;
}

function DictationEntry({ recording, onDelete, onRetry }: DictationEntryProps) {
	const [expanded, setExpanded] = useState(false);
	const [playing, setPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const audioUrl = useQuery(
		api.audioRecordings.getAudioUrl,
		recording.storageId ? { id: recording._id } : "skip",
	);

	const hasAudio = recording.storageId && !recording.audioCleanedAt;
	const canRetry =
		recording.status === "failed" && hasAudio && recording.retryCount < 3;

	const handleCopy = useCallback(async () => {
		if (!recording.transcript) return;
		await navigator.clipboard.writeText(recording.transcript);
		toast.success("Transcript copied");
	}, [recording.transcript]);

	const handlePlay = useCallback(() => {
		if (!audioUrl) return;
		if (playing && audioRef.current) {
			audioRef.current.pause();
			setPlaying(false);
			return;
		}
		const audio = new Audio(audioUrl);
		audioRef.current = audio;
		audio.onended = () => setPlaying(false);
		audio.play();
		setPlaying(true);
	}, [audioUrl, playing]);

	const transcript = recording.transcript ?? "";
	const isLong = transcript.length > 200;
	const displayText = expanded ? transcript : transcript.slice(0, 200);

	return (
		<div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
			{/* Header */}
			<div className="flex items-center gap-2">
				<StatusIndicator status={recording.status} />
				<span className="text-xs text-muted-foreground">
					{formatRelativeTime(recording.createdAt)}
				</span>
				{recording.duration != null && (
					<Badge variant="secondary" className="text-[10px] px-1.5 py-0">
						{formatDuration(recording.duration)}
					</Badge>
				)}
				{recording.audioCleanedAt && (
					<span className="text-[10px] text-muted-foreground italic">
						Audio expired
					</span>
				)}
				<div className="ml-auto flex items-center gap-1">
					{recording.transcript && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={handleCopy}
								>
									<Copy className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Copy transcript</TooltipContent>
						</Tooltip>
					)}
					{hasAudio && audioUrl && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={handlePlay}
								>
									<Play className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{playing ? "Stop" : "Play audio"}</TooltipContent>
						</Tooltip>
					)}
					{canRetry && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									onClick={() => onRetry(recording._id)}
								>
									<RefreshCw className="size-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Retry transcription</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 text-muted-foreground hover:text-red-500"
								onClick={() => onDelete(recording._id)}
							>
								<Trash2 className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Delete</TooltipContent>
					</Tooltip>
				</div>
			</div>

			{/* Transcript or error */}
			{recording.status === "failed" && recording.errorMessage && (
				<p className="text-xs text-red-500">{recording.errorMessage}</p>
			)}
			{transcript && (
				<div>
					<p className="text-sm text-foreground whitespace-pre-wrap">
						{displayText}
						{isLong && !expanded && "..."}
					</p>
					{isLong && (
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="text-xs text-muted-foreground hover:text-foreground mt-1"
						>
							{expanded ? "Show less" : "Show more"}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
