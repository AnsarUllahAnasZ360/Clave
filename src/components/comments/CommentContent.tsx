"use client";

import Link from "@tiptap/extension-link";
import { EditorContent, mergeAttributes, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { CustomMention } from "./mention-extension";
import "@/styles/tiptap.css";

export type CommentAttachment = {
	_id: string;
	name: string;
	mimeType?: string | null;
	url: string | null;
};

type CommentContentProps = {
	body: string;
	workspaceSlug?: string;
	className?: string;
	attachments?: CommentAttachment[];
};

function buildReadOnlyExtensions(workspaceSlug?: string) {
	return [
		StarterKit.configure({
			heading: false,
			horizontalRule: false,
			blockquote: false,
		}),
		Link.configure({
			openOnClick: true,
			HTMLAttributes: {
				target: "_blank",
				rel: "noopener noreferrer",
				class: "text-primary underline cursor-pointer",
			},
		}),
		CustomMention.configure({
			HTMLAttributes: {
				class: "mention-chip",
			},
			renderHTML({ options, node }) {
				const entityType = node.attrs.entityType;
				const id = node.attrs.id;

				const attrs: Record<string, string> = {
					"data-type": "mention",
					"data-id": id,
					"data-entity-type": entityType,
				};

				if (workspaceSlug && entityType === "document") {
					return [
						"a",
						mergeAttributes(options.HTMLAttributes, {
							...attrs,
							href: `/${workspaceSlug}/docs/${id}`,
							class: "mention-chip mention-chip--link",
						}),
						`@${node.attrs.label ?? id}`,
					];
				}

				if (workspaceSlug && entityType === "whiteboard") {
					return [
						"a",
						mergeAttributes(options.HTMLAttributes, {
							...attrs,
							href: `/${workspaceSlug}/boards/${id}`,
							class: "mention-chip mention-chip--link",
						}),
						`@${node.attrs.label ?? id}`,
					];
				}

				return [
					"span",
					mergeAttributes(options.HTMLAttributes, attrs),
					`@${node.attrs.label ?? id}`,
				];
			},
		}),
	];
}

function isTipTapJson(body: string): boolean {
	if (!body.startsWith("{")) return false;
	try {
		const parsed = JSON.parse(body);
		return parsed?.type === "doc" && Array.isArray(parsed?.content);
	} catch {
		return false;
	}
}

function RichContent({
	body,
	workspaceSlug,
}: {
	body: string;
	workspaceSlug?: string;
}) {
	const router = useRouter();

	const extensions = useMemo(
		() => buildReadOnlyExtensions(workspaceSlug),
		[workspaceSlug],
	);

	const editor = useEditor({
		extensions,
		content: JSON.parse(body),
		immediatelyRender: false,
		editable: false,
		editorProps: {
			attributes: {
				class:
					"tiptap-editor prose prose-sm dark:prose-invert max-w-none text-[13px] text-foreground/80",
			},
		},
	});

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			const target = e.target as HTMLElement;
			const mentionLink = target.closest("a.mention-chip--link");
			if (mentionLink instanceof HTMLAnchorElement) {
				e.preventDefault();
				router.push((mentionLink.getAttribute("href") ?? "/") as never);
			}
		},
		[router],
	);

	if (!editor) return null;
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: click handler intercepts mention link navigation
		// biome-ignore lint/a11y/noStaticElementInteractions: delegated click handler for mention links
		<div onClick={handleClick}>
			<EditorContent editor={editor} />
		</div>
	);
}

/** Render @[Name](userId) mentions as highlighted spans */
function renderMentionText(text: string) {
	const parts: React.ReactNode[] = [];
	const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
	let lastIndex = 0;
	let match = regex.exec(text);

	while (match !== null) {
		if (match.index > lastIndex) {
			parts.push(text.substring(lastIndex, match.index));
		}
		parts.push(
			<span key={match.index} className="text-primary font-medium">
				@{match[1]}
			</span>,
		);
		lastIndex = match.index + match[0].length;
		match = regex.exec(text);
	}

	if (lastIndex < text.length) {
		parts.push(text.substring(lastIndex));
	}

	return parts;
}

function AttachmentChips({
	attachments,
}: {
	attachments: CommentAttachment[];
}) {
	if (attachments.length === 0) return null;
	return (
		<div className="flex flex-wrap gap-1.5 mt-1.5">
			{attachments.map((att) => (
				<a
					key={att._id}
					href={att.url ?? undefined}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-foreground/80 hover:bg-muted/80 transition-colors"
				>
					<Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
					<span className="truncate max-w-[140px]">{att.name}</span>
				</a>
			))}
		</div>
	);
}

export function CommentContent({
	body,
	workspaceSlug,
	className,
	attachments,
}: CommentContentProps) {
	const hasAttachments = attachments && attachments.length > 0;

	if (isTipTapJson(body)) {
		return (
			<div className={className}>
				<RichContent body={body} workspaceSlug={workspaceSlug} />
				{hasAttachments && <AttachmentChips attachments={attachments} />}
			</div>
		);
	}

	return (
		<div className={className}>
			<p className="text-sm text-foreground/80 whitespace-pre-wrap break-words">
				{renderMentionText(body)}
			</p>
			{hasAttachments && <AttachmentChips attachments={attachments} />}
		</div>
	);
}

/**
 * Extract plain text from a comment body (TipTap JSON or plain text).
 * Used for notification previews and sub-issue titles.
 */
export function extractCommentText(body: string, maxLength = 100): string {
	if (isTipTapJson(body)) {
		try {
			const doc = JSON.parse(body);
			const texts: string[] = [];
			type TipTapNode = { text?: string; content?: TipTapNode[] };
			function walk(node: TipTapNode) {
				if (node.text) texts.push(node.text);
				if (node.content && Array.isArray(node.content)) {
					for (const child of node.content) {
						walk(child);
					}
				}
			}
			walk(doc);
			const full = texts.join(" ");
			return full.length > maxLength
				? `${full.substring(0, maxLength)}...`
				: full;
		} catch {
			return body.substring(0, maxLength);
		}
	}
	return body.length > maxLength ? `${body.substring(0, maxLength)}...` : body;
}
