"use client";

import {
	type CursorData,
	type CursorOverlayState,
	useCursorOverlay,
} from "@platejs/selection/react";
import { getTableGridAbove } from "@platejs/table";
import { RangeApi } from "platejs";
import { useEditorRef } from "platejs/react";

import { cn } from "@/lib/utils";

/** Extended cursor data that includes Yjs awareness user info for remote cursors. */
type RemoteCursorData = CursorData & {
	name?: string;
	color?: string;
};

export function CursorOverlay() {
	const { cursors } = useCursorOverlay();

	return (
		<>
			{cursors.map((cursor) => (
				<Cursor key={cursor.id} {...cursor} />
			))}
		</>
	);
}

function Cursor({
	id,
	caretPosition,
	data,
	selection,
	selectionRects,
}: CursorOverlayState<RemoteCursorData>) {
	const editor = useEditorRef();
	const {
		style,
		selectionStyle = style,
		name,
		color,
	} = data ?? ({} as RemoteCursorData);
	const isCursor = RangeApi.isCollapsed(selection);
	const isRemote = id !== "selection" && id !== "drag";

	// Skip overlay for multi-cell table selection (table has its own selection UI)
	if (id === "selection" && selection) {
		const cellEntries = getTableGridAbove(editor, {
			at: selection,
			format: "cell",
		});

		if (cellEntries.length > 1) {
			return null;
		}
	}

	// Remote cursor styles derived from awareness user color
	const remoteCursorStyle =
		isRemote && color ? { backgroundColor: color } : undefined;
	const remoteSelectionStyle =
		isRemote && color ? { backgroundColor: `${color}40` } : undefined;

	return (
		<>
			{selectionRects.map((position) => (
				<div
					key={`${position.left}-${position.top}-${position.width}-${position.height}`}
					className={cn(
						"pointer-events-none absolute z-10",
						id === "selection" && "bg-brand/25",
						id === "selection" && isCursor && "bg-primary",
					)}
					style={{
						...(isRemote ? remoteSelectionStyle : selectionStyle),
						...position,
					}}
				/>
			))}
			{caretPosition && (
				<div
					className={cn(
						"pointer-events-none absolute z-10 w-0.5",
						id === "drag" && "w-px bg-brand",
					)}
					style={{
						...caretPosition,
						...(isRemote ? remoteCursorStyle : style),
					}}
				>
					{isRemote && name && (
						<div
							className="absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] leading-none font-medium text-white"
							style={{ backgroundColor: color }}
						>
							{name}
						</div>
					)}
				</div>
			)}
		</>
	);
}
