import { createSlateEditor, type Value } from "platejs";

import { BaseEditorKit } from "@/components/editor/editor-base-kit";
import { EditorStatic } from "@/components/ui/editor-static";
import { blockNoteToSlate, prosemirrorToSlate } from "@/lib/content-converters";

interface DocumentReadOnlyProps {
	content: string | undefined;
}

// ---------------------------------------------------------------------------
// Content parsing
// ---------------------------------------------------------------------------

/**
 * Parse a content string into Slate JSON value.
 * Tries Slate JSON first, then ProseMirror JSON, then BlockNote JSON.
 */
function parseContent(content: string): Value | null {
	try {
		const parsed = JSON.parse(content);

		// Slate JSON: array of nodes with `children` (not BlockNote `props`)
		if (Array.isArray(parsed) && parsed.length > 0) {
			const first = parsed[0];
			// BlockNote JSON has `props` and `content` keys — skip those
			if (first.props !== undefined && first.content !== undefined) {
				return blockNoteToSlate(parsed) as Value;
			}
			return parsed as Value;
		}

		// ProseMirror JSON: { type: "doc", content: [...] }
		if (parsed?.type === "doc") {
			return prosemirrorToSlate(parsed) as Value;
		}

		return null;
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentReadOnly({ content }: DocumentReadOnlyProps) {
	if (!content) {
		return <DocumentReadOnlySkeleton />;
	}

	const value = parseContent(content);

	if (!value) {
		return <DocumentReadOnlySkeleton />;
	}

	const editor = createSlateEditor({
		plugins: BaseEditorKit,
		value,
	});

	return <EditorStatic editor={editor} variant="default" />;
}

function DocumentReadOnlySkeleton() {
	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
			<div className="h-4 w-full animate-pulse rounded bg-muted" />
			<div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
		</div>
	);
}
