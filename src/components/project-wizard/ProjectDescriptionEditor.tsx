import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { useEmbeddedAI } from "@/hooks/use-embedded-ai";
import { cn } from "@/lib/utils";
import "@/styles/tiptap.css";
import {
	ArrowsOutSimple,
	Image as ImageIcon,
	Plus,
	StarFour,
} from "@phosphor-icons/react/dist/ssr";

export function extractImageFilesFromClipboardData(
	clipboardData: DataTransfer | null | undefined,
): File[] {
	if (!clipboardData) return [];

	const files: File[] = [];

	for (const item of Array.from(clipboardData.items ?? [])) {
		if (item.kind === "file" && item.type.startsWith("image/")) {
			const file = item.getAsFile();
			if (file) files.push(file);
		}
	}

	// Some environments only expose clipboardData.files
	if (files.length === 0) {
		for (const file of Array.from(clipboardData.files ?? [])) {
			if (file.type.startsWith("image/")) files.push(file);
		}
	}

	return files;
}

export function extractImageFilesFromDataTransfer(
	dataTransfer: DataTransfer | null | undefined,
): File[] {
	if (!dataTransfer) return [];
	return Array.from(dataTransfer.files ?? []).filter((file) =>
		file.type.startsWith("image/"),
	);
}

type TemplateType =
	| "goal"
	| "scope"
	| "inScope"
	| "outScope"
	| "outcomes"
	| "feature";

interface ProjectDescriptionEditorProps {
	value?: string;
	onChange?: (value: string) => void;
	onExpandChange?: (isExpanded: boolean) => void;
	onFocusChange?: (isFocused: boolean) => void;
	placeholder?: string;
	className?: string;
	showTemplates?: boolean;
}

export function ProjectDescriptionEditor({
	value,
	onChange,
	onExpandChange,
	onFocusChange,
	placeholder,
	className,
	showTemplates = true,
}: ProjectDescriptionEditorProps) {
	const [isFocused, setIsFocused] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [aiLoading, setAiLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const workspace = useWorkspaceOptional();
	const { callEmbeddedAI } = useEmbeddedAI();
	const [existingSections, setExistingSections] = useState({
		goal: false,
		scope: false,
		outScope: false,
		outcomes: false,
		feature: false,
	});

	useEffect(() => {
		onFocusChange?.(isFocused);
	}, [isFocused, onFocusChange]);

	useEffect(() => {
		onExpandChange?.(isExpanded);
	}, [isExpanded, onExpandChange]);

	const defaultPlaceholder =
		placeholder ?? "Briefly describe the goal of this project/sprint...";

	const editor = useEditor({
		extensions: [
			StarterKit,
			// This editor stores content as HTML and currently inserts images as data URLs
			// (via file picker, paste, and drag/drop).
			// TipTap's Image extension blocks base64/data URLs unless explicitly enabled.
			Image.configure({ inline: false, allowBase64: true }),
			Placeholder.configure({
				placeholder: ({ node }: { node: unknown }) => {
					const name =
						node &&
						typeof node === "object" &&
						"type" in node &&
						(node as { type?: { name?: string } }).type?.name;
					if (name === "heading") {
						return "Whats the title?";
					}
					return defaultPlaceholder;
				},
			}),
			TaskList,
			TaskItem.configure({
				nested: true,
			}),
		],
		editorProps: {
			attributes: {
				class:
					"tiptap-editor h-full w-full outline-none prose prose-sm prose-invert dark:prose-invert max-w-none text-foreground [&_p]:text-foreground [&_*]:text-foreground",
			},
			handlePaste: (_view, event) => {
				const files = extractImageFilesFromClipboardData(
					(event as ClipboardEvent).clipboardData,
				);
				if (files.length === 0) return false;

				event.preventDefault();
				insertImageFiles(files);
				return true;
			},
			handleDrop: (_view, event) => {
				const files = extractImageFilesFromDataTransfer(
					(event as DragEvent).dataTransfer,
				);
				if (files.length === 0) return false;

				event.preventDefault();
				insertImageFiles(files);
				return true;
			},
		},
		content: value,
		editable: true,
		immediatelyRender: false,
		onFocus: () => setIsFocused(true),
		onUpdate: ({
			editor,
		}: {
			editor: { getText: () => string; getHTML: () => string };
		}) => {
			const text = editor.getText();
			setExistingSections({
				goal: text.includes("Goal:"),
				scope: text.includes("Scope:"),
				outScope: text.includes("Out of Scope:"),
				outcomes: text.includes("Expected Outcomes:"),
				feature: text.includes("Key feature:"),
			});
			onChange?.(editor.getHTML());
		},
	});

	const insertImageFiles = useCallback(
		(files: File[]) => {
			if (!editor) return;
			const imageFiles = files.filter((file) => file.type.startsWith("image/"));
			if (imageFiles.length === 0) return;

			for (const file of imageFiles) {
				const reader = new FileReader();
				reader.onload = (event) => {
					const url = event.target?.result as string | null | undefined;
					if (!url) return;
					editor
						.chain()
						.focus()
						.setImage({ src: url, alt: file.name })
						.createParagraphNear()
						.focus()
						.run();
				};
				reader.readAsDataURL(file);
			}
		},
		[editor],
	);

	useEffect(() => {
		if (!editor) return;
		if (value == null) return;
		const currentHtml = editor.getHTML();
		if (currentHtml === value) return;
		editor.commands.setContent(value);
	}, [value, editor]);

	// Handle "Write with AI" button click
	const handleAIWrite = useCallback(async () => {
		if (!editor || !workspace || aiLoading) return;
		const userPrompt = window.prompt("What should AI write about?");
		if (!userPrompt) return;

		setAiLoading(true);
		try {
			const result = await callEmbeddedAI({
				type: "document_write_from_prompt",
				context: { workspaceId: workspace.workspaceId },
				prompt: userPrompt,
			});
			if (result?.text) {
				editor.commands.insertContent(result.text);
			}
		} finally {
			setAiLoading(false);
		}
	}, [editor, workspace, aiLoading, callEmbeddedAI]);

	// Handle click outside to reset focus — use "click" not "mousedown"
	// to avoid racing with the editor's own click-to-focus behavior
	useEffect(() => {
		if (!isFocused) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setIsFocused(false);
			}
		};
		// Use a small delay so the editor's internal click handler fires first
		const timer = setTimeout(() => {
			document.addEventListener("click", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("click", handleClickOutside);
		};
	}, [isFocused]);

	const handleInsertImage = useCallback(() => {
		if (!editor) return;
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/*";
		input.multiple = true;
		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (!files) return;
			insertImageFiles(Array.from(files));
		};
		input.click();
	}, [editor, insertImageFiles]);

	const handleInsertTemplate = (type: TemplateType) => {
		if (!editor) return;

		switch (type) {
			case "goal":
				editor
					.chain()
					.focus()
					.insertContent(
						"<p><strong>Goal:</strong></p><p>Write the primary goal here...</p>",
					)
					.run();
				break;
			case "scope":
				editor
					.chain()
					.focus()
					.insertContent([
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "Scope:",
								},
							],
						},
						{
							type: "taskList",
							content: [
								{
									type: "taskItem",
									attrs: { checked: false },
									content: [
										{
											type: "paragraph",
											content: [
												{
													type: "text",
													text: "In scope item 1",
												},
											],
										},
									],
								},
								{
									type: "taskItem",
									attrs: { checked: false },
									content: [
										{
											type: "paragraph",
											content: [
												{
													type: "text",
													text: "In scope item 2",
												},
											],
										},
									],
								},
							],
						},
					])
					.run();
				break;
			case "inScope":
				editor
					.chain()
					.focus()
					.insertContent([
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "Scope:",
								},
							],
						},
						{
							type: "taskList",
							content: [
								{
									type: "taskItem",
									attrs: { checked: false },
									content: [
										{
											type: "paragraph",
											content: [{ type: "text", text: "In scope item" }],
										},
									],
								},
							],
						},
					])
					.run();
				break;
			case "outScope":
				editor
					.chain()
					.focus()
					.insertContent([
						{
							type: "paragraph",
							content: [
								{
									type: "text",
									marks: [{ type: "bold" }],
									text: "Out of Scope:",
								},
							],
						},
						{
							type: "taskList",
							content: [
								{
									type: "taskItem",
									attrs: { checked: false },
									content: [{ type: "paragraph", content: [] }],
								},
							],
						},
					])
					.run();
				break;
			case "outcomes":
				editor
					.chain()
					.focus()
					.insertContent(
						"<p><strong>Expected Outcomes:</strong></p><ol><li><p></p></li></ol>",
					)
					.run();
				break;
			case "feature":
				editor
					.chain()
					.focus()
					.insertContent(
						"<p><strong>Key feature:</strong></p><ul><li><p></p></li></ul>",
					)
					.run();
				break;
		}
	};

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative w-full rounded-lg group transition-all duration-300 ease-in-out flex flex-col overflow-hidden",
				isExpanded
					? "flex-1 min-h-0"
					: isFocused
						? "h-70 shrink-0"
						: "shrink-0",
				className,
			)}
		>
			{(isFocused || isExpanded) && (
				<div className="absolute border border-primary border-solid inset-0 pointer-events-none rounded-lg z-20" />
			)}

			<div
				className={cn(
					"size-full flex flex-col relative transition-colors",
					isFocused || isExpanded
						? "p-3.5 gap-1 bg-background"
						: "bg-muted/10 hover:bg-muted/20 rounded-lg cursor-text",
				)}
				role="presentation"
				// biome-ignore lint/a11y/noStaticElementInteractions: wrapper focuses editor on click
				onClick={() => {
					if (!isFocused) {
						setIsFocused(true);
						editor?.commands.focus();
					}
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						if (!isFocused) {
							setIsFocused(true);
							editor?.commands.focus();
						}
					}
				}}
			>
				{/* Editor content area */}
				<div
					className={cn(
						"flex grow relative w-full overflow-y-auto",
						isFocused || isExpanded
							? "items-start min-h-16"
							: "items-center min-h-8",
					)}
				>
					<div className="w-full [&_.ProseMirror]:text-foreground [&_.ProseMirror]:min-h-6 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:opacity-60">
						<EditorContent editor={editor} />
					</div>

					{(isFocused || isExpanded) && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setIsExpanded((prev) => !prev);
							}}
							className="absolute top-0 right-0 p-2 opacity-50 hover:opacity-100 transition-opacity z-30"
							title={isExpanded ? "Collapse" : "Expand"}
						>
							<ArrowsOutSimple className="size-4 text-muted-foreground" />
						</button>
					)}
				</div>

				{/* Write with AI button — always visible as separate row */}
				{!isFocused && !isExpanded && (
					<div className="flex justify-end px-2 pb-2 shrink-0">
						<button
							type="button"
							className="bg-muted-foreground/8 flex gap-1.5 h-7 items-center px-3 py-0.5 rounded-full hover:bg-muted-foreground/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							onClick={(e) => {
								e.stopPropagation();
								handleAIWrite();
							}}
							disabled={aiLoading || !workspace}
						>
							<div className="size-3.5">
								{aiLoading ? (
									<div className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
								) : (
									<StarFour weight="fill" className="size-3.5 text-primary" />
								)}
							</div>
							<span className="font-medium text-foreground text-xs tracking-wide">
								{aiLoading ? "Writing..." : "Write with AI"}
							</span>
						</button>
					</div>
				)}

				{/* Full toolbar when focused */}
				{(isFocused || isExpanded) && (
					<div className="w-full overflow-hidden shrink-0 animate-in fade-in zoom-in-95 duration-200">
						<div className="h-px w-full bg-border my-2" />
						<div className="flex flex-wrap gap-2 items-center w-full">
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									handleInsertImage();
								}}
								className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
								title="Add image"
							>
								<ImageIcon
									className="size-3.5 text-muted-foreground"
									weight="fill"
								/>
								<span className="font-medium text-foreground text-xs">
									Image
								</span>
							</button>
							{showTemplates && (
								<>
									{!existingSections.goal && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("goal")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												Goal
											</span>
										</button>
									)}

									{!existingSections.scope && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("scope")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												Scope
											</span>
										</button>
									)}

									{!existingSections.scope && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("inScope")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												In scope
											</span>
										</button>
									)}

									{!existingSections.outcomes && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("outcomes")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												Outcomes
											</span>
										</button>
									)}

									{!existingSections.outScope && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("outScope")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												Out of scope
											</span>
										</button>
									)}

									{!existingSections.feature && (
										<button
											type="button"
											onClick={() => handleInsertTemplate("feature")}
											className="flex gap-1.5 items-center opacity-60 hover:opacity-100 hover:bg-muted/50 px-2 py-1 rounded transition-all"
										>
											<Plus className="size-3.5 text-muted-foreground" />
											<span className="font-medium text-foreground text-xs">
												Key feature
											</span>
										</button>
									)}
								</>
							)}

							<div className="flex-1" />

							<div className="flex flex-col items-center justify-center ml-2">
								<button
									type="button"
									className="bg-muted-foreground/8 flex gap-1.5 h-7 items-center px-3 py-0.5 rounded-full hover:bg-muted-foreground/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
									onClick={handleAIWrite}
									disabled={aiLoading || !workspace}
								>
									<div className="size-3.5">
										{aiLoading ? (
											<div className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
										) : (
											<StarFour
												weight="fill"
												className="size-3.5 text-primary"
											/>
										)}
									</div>
									<span className="font-medium text-foreground text-xs tracking-wide">
										{aiLoading ? "Writing..." : "Write with AI"}
									</span>
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
