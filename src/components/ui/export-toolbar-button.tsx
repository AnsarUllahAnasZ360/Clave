"use client";

import { MarkdownPlugin } from "@platejs/markdown";
import type { DropdownMenuProps } from "@radix-ui/react-dropdown-menu";
import { ArrowDownToLineIcon } from "lucide-react";
import type { SlatePlugin } from "platejs";
import { createSlateEditor } from "platejs";
import { useEditorRef } from "platejs/react";
import { serializeHtml } from "platejs/static";
import * as React from "react";
import { BaseEditorKit } from "@/components/editor/editor-base-kit";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorStatic } from "./editor-static";
import { ToolbarButton } from "./toolbar";

/**
 * Extract a filename-safe title from the editor's first heading,
 * falling back to "document" if none found.
 */
function getDocumentTitle(editor: ReturnType<typeof useEditorRef>): string {
	for (const node of editor.children) {
		if (
			"type" in node &&
			(node.type === "h1" || node.type === "h2") &&
			"children" in node &&
			Array.isArray(node.children)
		) {
			const text = node.children
				.map((c) => ("text" in c ? String(c.text) : ""))
				.join("")
				.trim();
			if (text) {
				// Sanitize for filename: remove chars invalid in filenames
				return text.replace(/[<>:"/\\|?*]/g, "").trim() || "document";
			}
		}
	}
	return "document";
}

export function ExportToolbarButton(props: DropdownMenuProps) {
	const editor = useEditorRef();
	const [open, setOpen] = React.useState(false);

	const getCanvas = async () => {
		const { default: html2canvas } = await import("html2canvas-pro");

		const style = document.createElement("style");
		document.head.append(style);

		const canvas = await html2canvas(editor.api.toDOMNode(editor)!, {
			onclone: (document: Document) => {
				const editorElement = document.querySelector(
					'[contenteditable="true"]',
				);
				if (editorElement) {
					Array.from(editorElement.querySelectorAll("*")).forEach((element) => {
						const existingStyle = element.getAttribute("style") || "";
						element.setAttribute(
							"style",
							`${existingStyle}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important`,
						);
					});
				}
			},
		});
		style.remove();

		return canvas;
	};

	const downloadFile = async (url: string, filename: string) => {
		const response = await fetch(url);

		const blob = await response.blob();
		const blobUrl = window.URL.createObjectURL(blob);

		const link = document.createElement("a");
		link.href = blobUrl;
		link.download = filename;
		document.body.append(link);
		link.click();
		link.remove();

		// Clean up the blob URL
		window.URL.revokeObjectURL(blobUrl);
	};

	const exportToPdf = async () => {
		const canvas = await getCanvas();

		const PDFLib = await import("pdf-lib");
		const pdfDoc = await PDFLib.PDFDocument.create();
		const page = pdfDoc.addPage([canvas.width, canvas.height]);
		const imageEmbed = await pdfDoc.embedPng(canvas.toDataURL("PNG"));
		const { height, width } = imageEmbed.scale(1);
		page.drawImage(imageEmbed, {
			height,
			width,
			x: 0,
			y: 0,
		});
		const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });

		await downloadFile(pdfBase64, `${getDocumentTitle(editor)}.pdf`);
	};

	const exportToImage = async () => {
		const canvas = await getCanvas();
		await downloadFile(
			canvas.toDataURL("image/png"),
			`${getDocumentTitle(editor)}.png`,
		);
	};

	const exportToHtml = async () => {
		const editorStatic = createSlateEditor({
			plugins: BaseEditorKit,
			value: editor.children,
		});

		const editorHtml = await serializeHtml(editorStatic, {
			editorComponent: EditorStatic,
			props: { style: { padding: "0 calc(50% - 350px)", paddingBottom: "" } },
		});

		const title = getDocumentTitle(editor);

		const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 700px; margin: 0 auto; padding: 2rem 1rem; }
      h1 { font-size: 2em; font-weight: 700; margin: 1.5em 0 0.5em; }
      h2 { font-size: 1.5em; font-weight: 600; margin: 1.25em 0 0.5em; }
      h3 { font-size: 1.25em; font-weight: 600; margin: 1em 0 0.5em; }
      h4, h5, h6 { font-size: 1em; font-weight: 600; margin: 1em 0 0.5em; }
      p { margin: 0.5em 0; }
      ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
      li { margin: 0.25em 0; }
      blockquote { border-left: 3px solid #d1d5db; padding-left: 1em; margin: 0.5em 0; color: #6b7280; }
      code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; background: #f3f4f6; padding: 0.15em 0.3em; border-radius: 3px; font-size: 0.9em; }
      pre { background: #1e293b; color: #e2e8f0; padding: 1em; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
      pre code { background: none; padding: 0; color: inherit; }
      a { color: #2563eb; text-decoration: underline; }
      img { max-width: 100%; height: auto; border-radius: 4px; }
      table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
      th, td { border: 1px solid #d1d5db; padding: 0.5em 0.75em; text-align: left; }
      th { background: #f9fafb; font-weight: 600; }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
      strong { font-weight: 700; }
      em { font-style: italic; }
      s { text-decoration: line-through; }
      mark { background: #fef08a; padding: 0.1em 0.2em; }
      kbd { font-family: 'SFMono-Regular', Consolas, monospace; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 3px; padding: 0.1em 0.4em; font-size: 0.85em; }
    </style>
  </head>
  <body>
    ${editorHtml}
  </body>
</html>`;

		const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

		await downloadFile(url, `${title}.html`);
	};

	const exportToMarkdown = async () => {
		const md = editor.getApi(MarkdownPlugin).markdown.serialize();
		const url = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;
		await downloadFile(url, `${getDocumentTitle(editor)}.md`);
	};

	const exportToWord = async () => {
		const [{ exportToDocx }, { DocxExportKit }] = await Promise.all([
			import("@platejs/docx-io"),
			import("@/components/editor/plugins/docx-export-kit"),
		]);
		const blob = await exportToDocx(editor.children, {
			editorPlugins: [...BaseEditorKit, ...DocxExportKit] as SlatePlugin[],
		});

		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `${getDocumentTitle(editor)}.docx`;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
			<DropdownMenuTrigger asChild>
				<ToolbarButton pressed={open} tooltip="Export" isDropdown>
					<ArrowDownToLineIcon className="size-4" />
				</ToolbarButton>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start">
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={exportToHtml}>
						Export as HTML
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={exportToPdf}>
						Export as PDF
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={exportToImage}>
						Export as Image
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={exportToMarkdown}>
						Export as Markdown
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={exportToWord}>
						Export as Word
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
