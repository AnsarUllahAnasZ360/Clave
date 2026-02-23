"use client";

import type { FileUIPart } from "ai";
import { FileTextIcon, ImageIcon, XIcon } from "lucide-react";
import Image from "next/image";
import type { KeyboardEventHandler } from "react";
import { memo, useCallback, useState } from "react";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
	getAttachmentLabel,
	getMediaCategory,
} from "@/components/ai-elements/attachments";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
	PromptInput,
	PromptInputActionAddAttachments,
	PromptInputActionMenu,
	PromptInputActionMenuContent,
	PromptInputActionMenuTrigger,
	PromptInputBody,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type ChatInputMessage = {
	text: string;
	files: FileUIPart[];
};

export type ChatInputProps = {
	/** Called when the user submits a message */
	onSubmit: (message: ChatInputMessage) => void | Promise<void>;
	/** Called when the user clicks the stop button during streaming */
	onStop?: () => void;
	/** Whether the input is disabled (e.g. pending approval) */
	disabled?: boolean;
	/** Whether a message is currently being sent */
	isSending?: boolean;
	/** Whether the assistant is currently streaming a response */
	isStreaming?: boolean;
	/** Placeholder text for the textarea */
	placeholder?: string;
	/** Additional className for the outer container */
	className?: string;
	/** Optional content rendered in the footer left area (e.g. ModelSelector) */
	footerLeft?: React.ReactNode;
	/** Optional content rendered before the submit button (e.g. VoiceButton) */
	beforeSubmit?: React.ReactNode;
	/** Controlled input value (enables external state management) */
	value?: string;
	/** Called when the input value changes (for controlled mode) */
	onValueChange?: (value: string) => void;
	/** Keyboard handler passed to the textarea */
	onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
	/** Additional menu actions rendered in the plus-menu */
	actionMenuItems?: React.ReactNode;
	/** MIME types accepted for file attachments */
	attachmentAccept?: string;
	/** Maximum number of files allowed per message */
	maxFiles?: number;
	/** Maximum size per file in bytes */
	maxFileSize?: number;
};

// ── ChatInput ────────────────────────────────────────────────────────────

const DEFAULT_ATTACHMENT_ACCEPT = [
	"image/*",
	"application/pdf",
	"text/plain",
	"text/markdown",
	"text/csv",
	"text/html",
	"text/xml",
	"application/json",
	"application/rtf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/zip",
	"application/x-yaml",
	"application/xml",
].join(",");

// ── Attachment chip (ChatGPT-style) ──────────────────────────────────────

function AttachmentChip({
	file,
	onRemove,
}: {
	file: FileUIPart & { id: string };
	onRemove: () => void;
}) {
	const data = file as AttachmentData;
	const category = getMediaCategory(data);
	const label = getAttachmentLabel(data);
	const isImage = category === "image" && file.url;

	return (
		<div className="group/chip relative flex items-center gap-2 rounded-lg border border-border bg-muted/50 pr-6 transition-colors hover:bg-muted">
			{/* Thumbnail or icon */}
			{isImage ? (
				<Image
					src={file.url}
					alt={label}
					width={40}
					height={40}
					unoptimized
					className="size-10 shrink-0 rounded-l-lg object-cover"
				/>
			) : (
				<div className="flex size-10 shrink-0 items-center justify-center rounded-l-lg bg-muted">
					{category === "document" ? (
						<FileTextIcon className="size-4 text-muted-foreground" />
					) : (
						<ImageIcon className="size-4 text-muted-foreground" />
					)}
				</div>
			)}
			{/* File info */}
			<div className="min-w-0 py-1.5">
				<p className="max-w-[180px] truncate text-xs font-medium">{label}</p>
				{file.mediaType && (
					<p className="truncate text-[10px] text-muted-foreground">
						{getFileTypeLabel(file.mediaType)}
					</p>
				)}
			</div>
			{/* Remove button */}
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-muted hover:text-foreground group-hover/chip:opacity-100"
				aria-label="Remove attachment"
			>
				<XIcon className="size-3" />
			</button>
		</div>
	);
}

function getFileTypeLabel(mediaType: string): string {
	const map: Record<string, string> = {
		"application/pdf": "PDF",
		"text/plain": "Text",
		"text/markdown": "Markdown",
		"text/csv": "CSV",
		"text/html": "HTML",
		"application/json": "JSON",
		"application/rtf": "Rich Text",
		"application/msword": "Word",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
			"Word",
		"application/vnd.ms-excel": "Excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
			"Excel",
		"application/vnd.ms-powerpoint": "PowerPoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
			"PowerPoint",
		"application/zip": "ZIP",
	};
	if (mediaType.startsWith("image/")) return "Image";
	if (mediaType.startsWith("video/")) return "Video";
	if (mediaType.startsWith("audio/")) return "Audio";
	return map[mediaType] || "File";
}

// ── Attachment preview strip ─────────────────────────────────────────────

function PromptInputAttachmentsDisplay() {
	const attachments = usePromptInputAttachments();

	if (attachments.files.length === 0) return null;

	return (
		<div className="flex w-full flex-wrap gap-2 px-3 pt-3">
			{attachments.files.map((attachment) => (
				<AttachmentChip
					key={attachment.id}
					file={attachment}
					onRemove={() => attachments.remove(attachment.id)}
				/>
			))}
		</div>
	);
}

// ── Main component ───────────────────────────────────────────────────────

export const ChatInput = memo(function ChatInput({
	onSubmit,
	onStop,
	disabled,
	isSending,
	isStreaming,
	placeholder = "Ask your AI teammate...",
	className,
	footerLeft,
	beforeSubmit,
	value: controlledValue,
	onValueChange,
	onKeyDown,
	actionMenuItems,
	attachmentAccept = DEFAULT_ATTACHMENT_ACCEPT,
	maxFiles = 8,
	maxFileSize = 25 * 1024 * 1024,
}: ChatInputProps) {
	const [internalValue, setInternalValue] = useState("");

	const isControlled = controlledValue !== undefined;
	const inputValue = isControlled ? controlledValue : internalValue;

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const text = message.text.trim();
			const files = message.files;
			if (!text && files.length === 0) return;
			await onSubmit({ files, text });
			// PromptInput clears uncontrolled input itself; controlled mode needs
			// explicit parent-state sync after a successful submit.
			if (isControlled) onValueChange?.("");
		},
		[onSubmit, isControlled, onValueChange],
	);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			const newValue = e.currentTarget.value;
			if (isControlled) {
				onValueChange?.(newValue);
			} else {
				setInternalValue(newValue);
			}
		},
		[isControlled, onValueChange],
	);

	return (
		<div
			data-ai-chat-input="true"
			className={cn(
				"px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
				className,
			)}
		>
			<PromptInput
				accept={attachmentAccept}
				multiple
				maxFiles={maxFiles}
				maxFileSize={maxFileSize}
				onSubmit={handleSubmit}
				className="[&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:shadow-sm [&:focus-within_[data-slot=input-group]]:shadow-md"
			>
				<PromptInputAttachmentsDisplay />
				<PromptInputBody>
					<PromptInputTextarea
						data-ai-chat-input="true"
						value={inputValue}
						onChange={handleChange}
						onKeyDown={onKeyDown}
						placeholder={placeholder}
						disabled={disabled}
						aria-label="Message input"
						aria-describedby="chat-input-hint"
						className="min-h-10 max-h-32"
					/>
				</PromptInputBody>
				<PromptInputFooter>
					<div className="flex items-center gap-1">
						<PromptInputActionMenu>
							<PromptInputActionMenuTrigger
								disabled={disabled}
								tooltip="Add files and context"
							/>
							<PromptInputActionMenuContent>
								<PromptInputActionAddAttachments label="Add photos and files" />
								{actionMenuItems}
							</PromptInputActionMenuContent>
						</PromptInputActionMenu>
						{footerLeft}
					</div>
					<div className="flex items-center gap-1">
						{beforeSubmit}
						<PromptInputSubmit
							disabled={
								disabled || ((!inputValue.trim() || isSending) && !isStreaming)
							}
							onStop={onStop}
							status={
								isStreaming ? "streaming" : isSending ? "submitted" : "ready"
							}
						/>
					</div>
				</PromptInputFooter>
			</PromptInput>
			<span id="chat-input-hint" className="sr-only">
				Press Enter to send, Shift+Enter for new line
			</span>
		</div>
	);
});
