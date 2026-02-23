"use client";

import {
	Link as LinkIcon,
	ListBullets,
	ListChecks,
	ListNumbers,
	TextB,
	TextHOne,
	TextHThree,
	TextHTwo,
	TextItalic,
} from "@phosphor-icons/react/dist/ssr";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import "@/styles/tiptap.css";

type TipTapEditorProps = {
	content?: string;
	editable?: boolean;
	placeholder?: string;
	onUpdate?: (jsonString: string) => void;
	className?: string;
};

const extensions = [
	StarterKit.configure({
		bulletList: { keepMarks: true },
		orderedList: { keepMarks: true },
	}),
	Placeholder.configure({
		placeholder: "Start writing...",
	}),
	Link.configure({
		openOnClick: true,
		HTMLAttributes: {
			target: "_blank",
			rel: "noopener noreferrer",
			class: "text-primary underline cursor-pointer",
		},
	}),
	TaskList,
	TaskItem.configure({
		nested: true,
	}),
];

function parseContent(content: string): string | Record<string, unknown> {
	try {
		return JSON.parse(content);
	} catch {
		return content;
	}
}

export function TipTapEditor({
	content,
	editable = true,
	placeholder,
	onUpdate,
	className,
}: TipTapEditorProps) {
	const editor = useEditor({
		extensions: placeholder
			? [
					...extensions.filter((ext) => ext.name !== "placeholder"),
					Placeholder.configure({ placeholder }),
				]
			: extensions,
		content: content ? parseContent(content) : undefined,
		editable,
		onUpdate: ({ editor: e }) => {
			onUpdate?.(JSON.stringify(e.getJSON()));
		},
		editorProps: {
			attributes: {
				class:
					"tiptap-editor prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[120px] px-3 py-2",
			},
		},
	});

	// Sync content changes from outside
	useEffect(() => {
		if (!editor || !content) return;
		const parsed = parseContent(content);
		const currentJson = JSON.stringify(editor.getJSON());
		if (currentJson !== content) {
			editor.commands.setContent(parsed);
		}
	}, [editor, content]);

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

	if (!editor) return null;

	if (!editable) {
		return (
			<div className={className}>
				<EditorContent editor={editor} />
			</div>
		);
	}

	return (
		<div
			className={`rounded-lg border border-border bg-background ${className ?? ""}`}
		>
			<div className="flex items-center gap-0.5 border-b border-border px-2 py-1 flex-wrap">
				<ToolbarButton
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 1 }).run()
					}
					active={editor.isActive("heading", { level: 1 })}
					title="Heading 1"
				>
					<TextHOne className="h-4 w-4" />
				</ToolbarButton>
				<ToolbarButton
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 2 }).run()
					}
					active={editor.isActive("heading", { level: 2 })}
					title="Heading 2"
				>
					<TextHTwo className="h-4 w-4" />
				</ToolbarButton>
				<ToolbarButton
					onClick={() =>
						editor.chain().focus().toggleHeading({ level: 3 }).run()
					}
					active={editor.isActive("heading", { level: 3 })}
					title="Heading 3"
				>
					<TextHThree className="h-4 w-4" />
				</ToolbarButton>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<ToolbarButton
					onClick={() => editor.chain().focus().toggleBold().run()}
					active={editor.isActive("bold")}
					title="Bold"
				>
					<TextB className="h-4 w-4" />
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleItalic().run()}
					active={editor.isActive("italic")}
					title="Italic"
				>
					<TextItalic className="h-4 w-4" />
				</ToolbarButton>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<ToolbarButton
					onClick={() => editor.chain().focus().toggleBulletList().run()}
					active={editor.isActive("bulletList")}
					title="Bullet list"
				>
					<ListBullets className="h-4 w-4" />
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleOrderedList().run()}
					active={editor.isActive("orderedList")}
					title="Ordered list"
				>
					<ListNumbers className="h-4 w-4" />
				</ToolbarButton>
				<ToolbarButton
					onClick={() => editor.chain().focus().toggleTaskList().run()}
					active={editor.isActive("taskList")}
					title="Task list"
				>
					<ListChecks className="h-4 w-4" />
				</ToolbarButton>

				<Separator orientation="vertical" className="mx-1 h-5" />

				<ToolbarButton
					onClick={setLink}
					active={editor.isActive("link")}
					title="Link"
				>
					<LinkIcon className="h-4 w-4" />
				</ToolbarButton>
			</div>

			<EditorContent editor={editor} />
		</div>
	);
}

function ToolbarButton({
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
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			className={`h-7 w-7 ${active ? "bg-muted text-foreground" : "text-muted-foreground"}`}
			onClick={onClick}
			title={title}
		>
			{children}
		</Button>
	);
}

/** Extract plain text from TipTap, BlockNote, or Slate JSON content, truncated to maxLength */
export function extractTextPreview(
	jsonString: string | undefined,
	maxLength = 150,
): string {
	if (!jsonString) return "";
	try {
		const parsed = JSON.parse(jsonString);

		// Array format: could be BlockNote JSON or Slate JSON
		if (Array.isArray(parsed)) {
			const texts: string[] = [];
			// biome-ignore lint/suspicious/noExplicitAny: flexible node walking
			function walkNodes(nodes: any[]) {
				for (const node of nodes) {
					if (!node || typeof node !== "object") continue;
					// Text leaf (Slate or BlockNote inline)
					if (typeof node.text === "string" && node.text) {
						texts.push(node.text);
					}
					// Slate mention: { type: "mention", value: "Name" }
					if (node.type === "mention" && typeof node.value === "string") {
						texts.push(`@${node.value}`);
					}
					// Walk Slate children
					if (Array.isArray(node.children)) {
						walkNodes(node.children);
					}
					// Walk BlockNote inline content
					if (Array.isArray(node.content)) {
						walkNodes(node.content);
					}
				}
			}
			walkNodes(parsed);
			const full = texts.join(" ");
			return full.length > maxLength
				? `${full.substring(0, maxLength)}...`
				: full;
		}

		// TipTap JSON: object with type:"doc" and nested content
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
		walk(parsed);
		const full = texts.join(" ");
		return full.length > maxLength
			? `${full.substring(0, maxLength)}...`
			: full;
	} catch {
		return jsonString.substring(0, maxLength);
	}
}
