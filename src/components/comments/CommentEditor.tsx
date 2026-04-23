"use client";

import {
	Code,
	Link as LinkIcon,
	ListBullets,
	ListNumbers,
	TextB,
	TextItalic,
} from "@phosphor-icons/react/dist/ssr";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, mergeAttributes, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { Paperclip, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MentionItem } from "./MentionList";
import { CustomMention } from "./mention-extension";
import "@/styles/tiptap.css";

export type PendingAttachment = {
	id: string;
	name: string;
	uploading: boolean;
};

type CommentEditorProps = {
	initialContent?: string;
	placeholder?: string;
	onSubmit: (jsonString: string) => void;
	onCancel?: () => void;
	onAttach?: (file: File) => void;
	onRemoveAttachment?: (id: string) => void;
	pendingAttachments?: PendingAttachment[];
	submitting?: boolean;
	autoFocus?: boolean;
	className?: string;
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">;
};

function buildExtensions(
	placeholderText: string,
	mentionSuggestion?: Omit<SuggestionOptions<MentionItem>, "editor">,
) {
	const exts = [
		StarterKit.configure({
			heading: false,
			horizontalRule: false,
			blockquote: false,
			bulletList: { keepMarks: true },
			orderedList: { keepMarks: true },
			// TipTap v3 bundles Link inside StarterKit. We register Link
			// explicitly below with custom options, so disable the
			// bundled one here to avoid "Duplicate extension names: link".
			link: false,
		}),
		Placeholder.configure({
			placeholder: placeholderText,
		}),
		Link.configure({
			openOnClick: false,
			HTMLAttributes: {
				target: "_blank",
				rel: "noopener noreferrer",
				class: "text-primary underline cursor-pointer",
			},
		}),
	];

	if (mentionSuggestion) {
		exts.push(
			CustomMention.configure({
				HTMLAttributes: {
					class: "mention-chip",
				},
				renderHTML({ options, node }) {
					return [
						"span",
						mergeAttributes(options.HTMLAttributes, {
							"data-type": "mention",
							"data-id": node.attrs.id,
							"data-entity-type": node.attrs.entityType,
						}),
						`@${node.attrs.label ?? node.attrs.id}`,
					];
				},
				suggestion: mentionSuggestion,
			}) as never,
		);
	}

	return exts;
}

function parseContent(content: string | undefined) {
	if (!content) return undefined;
	try {
		return JSON.parse(content);
	} catch {
		return undefined;
	}
}

export function CommentEditor({
	initialContent,
	placeholder,
	onSubmit,
	onCancel,
	onAttach,
	onRemoveAttachment,
	pendingAttachments,
	submitting,
	autoFocus,
	className,
	mentionSuggestion,
}: CommentEditorProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const submitted = useRef(false);

	const extensions = useMemo(
		() =>
			buildExtensions(placeholder ?? "Write a comment...", mentionSuggestion),
		[placeholder, mentionSuggestion],
	);

	const [isEmpty, setIsEmpty] = useState(true);

	const editor = useEditor({
		extensions,
		content: parseContent(initialContent),
		immediatelyRender: false,
		autofocus: autoFocus ? "end" : false,
		editorProps: {
			attributes: {
				class:
					"tiptap-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[40px] px-3 py-2 text-[13px]",
			},
		},
		onUpdate: ({ editor: e }) => {
			setIsEmpty(e.isEmpty);
		},
	});

	const handleSubmit = useCallback(() => {
		if (!editor || editor.isEmpty || submitting) return;
		submitted.current = true;
		onSubmit(JSON.stringify(editor.getJSON()));
		editor.commands.clearContent(true);
		submitted.current = false;
	}, [editor, submitting, onSubmit]);

	const setLink = useCallback(() => {
		if (!editor) return;
		const previousUrl = editor.getAttributes("link").href;
		const url = window.prompt("URL", previousUrl);
		if (url === null) return;
		if (url === "") {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
	}, [editor]);

	// Cmd+Enter to submit, Escape to cancel
	useEffect(() => {
		if (!editor) return;
		const el = editor.view.dom;
		const handler = (event: KeyboardEvent) => {
			if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				handleSubmit();
			}
			if (event.key === "Escape" && onCancel) {
				event.preventDefault();
				onCancel();
			}
		};
		el.addEventListener("keydown", handler);
		return () => {
			el.removeEventListener("keydown", handler);
		};
	}, [editor, handleSubmit, onCancel]);

	const handleFileSelect = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file && onAttach) {
				if (file.size > 10 * 1024 * 1024) {
					return; // 10MB limit
				}
				onAttach(file);
			}
			// Reset input so the same file can be selected again
			if (fileInputRef.current) fileInputRef.current.value = "";
		},
		[onAttach],
	);

	if (!editor) return null;

	return (
		<div
			className={cn(
				"rounded-lg border border-border/60 bg-background overflow-hidden",
				className,
			)}
		>
			<EditorContent editor={editor} />

			{/* Pending attachment chips */}
			{pendingAttachments && pendingAttachments.length > 0 && (
				<div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-t border-border/30">
					{pendingAttachments.map((att) => (
						<span
							key={att.id}
							className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground/80"
						>
							<Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
							<span className="truncate max-w-[120px]">{att.name}</span>
							{att.uploading ? (
								<span className="text-muted-foreground text-[10px]">...</span>
							) : (
								onRemoveAttachment && (
									<button
										type="button"
										onClick={() => onRemoveAttachment(att.id)}
										className="ml-0.5 text-muted-foreground hover:text-foreground"
									>
										<X className="h-3 w-3" />
									</button>
								)
							)}
						</span>
					))}
				</div>
			)}

			<div className="flex items-center justify-between border-t border-border/40 px-1.5 py-1">
				<div className="flex items-center gap-0.5">
					<ToolbarBtn
						onClick={() => editor.chain().focus().toggleBold().run()}
						active={editor.isActive("bold")}
						title="Bold (Ctrl+B)"
					>
						<TextB className="h-3.5 w-3.5" />
					</ToolbarBtn>
					<ToolbarBtn
						onClick={() => editor.chain().focus().toggleItalic().run()}
						active={editor.isActive("italic")}
						title="Italic (Ctrl+I)"
					>
						<TextItalic className="h-3.5 w-3.5" />
					</ToolbarBtn>
					<ToolbarBtn
						onClick={() => editor.chain().focus().toggleBulletList().run()}
						active={editor.isActive("bulletList")}
						title="Bullet list"
					>
						<ListBullets className="h-3.5 w-3.5" />
					</ToolbarBtn>
					<ToolbarBtn
						onClick={() => editor.chain().focus().toggleOrderedList().run()}
						active={editor.isActive("orderedList")}
						title="Ordered list"
					>
						<ListNumbers className="h-3.5 w-3.5" />
					</ToolbarBtn>
					<ToolbarBtn
						onClick={setLink}
						active={editor.isActive("link")}
						title="Link"
					>
						<LinkIcon className="h-3.5 w-3.5" />
					</ToolbarBtn>
					<ToolbarBtn
						onClick={() => editor.chain().focus().toggleCode().run()}
						active={editor.isActive("code")}
						title="Inline code"
					>
						<Code className="h-3.5 w-3.5" />
					</ToolbarBtn>
					{onAttach && (
						<ToolbarBtn
							onClick={() => fileInputRef.current?.click()}
							active={false}
							title="Attach file"
						>
							<Paperclip className="h-3.5 w-3.5" />
						</ToolbarBtn>
					)}
				</div>

				<div className="flex items-center gap-1">
					{onCancel && (
						<Button
							size="sm"
							variant="ghost"
							onClick={onCancel}
							className="h-6 text-xs px-2"
						>
							Cancel
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={handleSubmit}
						disabled={isEmpty || submitting}
						className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
						title="Submit (Cmd+Enter)"
					>
						<Send className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{/* Hidden file input */}
			{onAttach && (
				<input
					ref={fileInputRef}
					type="file"
					className="hidden"
					onChange={handleFileSelect}
				/>
			)}
		</div>
	);
}

function ToolbarBtn({
	onClick,
	active,
	title,
	children,
}: {
	onClick: () => void;
	active: boolean;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className={cn(
				"h-6 w-6 flex items-center justify-center rounded transition-colors",
				active
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
			)}
			onClick={onClick}
			title={title}
		>
			{children}
		</button>
	);
}
