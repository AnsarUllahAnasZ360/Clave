"use client";

import type { AnyPluginConfig, Value } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import type * as React from "react";
import { useMemo } from "react";

import { Editor, EditorContainer } from "@/components/ui/editor";

import { createBasePlugins, createSimplePlugins } from "./plate-plugins";

interface PlateEditorProps {
	/** Initial editor value (Slate JSON nodes). */
	value?: Value;
	/** Called when editor content changes. */
	onChange?: (value: Value) => void;
	/** Read-only mode (disables editing). */
	readOnly?: boolean;
	/** Placeholder text shown in empty editor. */
	placeholder?: string;
	/** Additional plugins to append after base plugins. */
	plugins?: AnyPluginConfig[];
	/** Override the entire plugin set (ignores `variant`). */
	overridePlugins?: AnyPluginConfig[];
	/** Editor variant: "full" includes toolbars/DnD/collaboration, "simple" is lightweight. */
	variant?: "full" | "simple";
	/** Show fixed toolbar. Defaults to true for "full" variant, false for "simple". */
	showToolbar?: boolean;
	/** Editor container CSS class override. */
	className?: string;
	/** Editor content CSS class override. */
	editorClassName?: string;
	/** Auto-focus the editor on mount. */
	autoFocus?: boolean;
	/** Children rendered inside the Plate context (e.g., AI bridge components). */
	children?: React.ReactNode;
}

export function PlateEditor({
	value,
	onChange,
	readOnly = false,
	placeholder,
	plugins: extraPlugins,
	overridePlugins,
	variant = "full",
	showToolbar,
	className,
	editorClassName,
	autoFocus = false,
	children,
}: PlateEditorProps) {
	const toolbarVisible = showToolbar ?? variant === "full";
	const basePlugins = useMemo(
		() => (variant === "full" ? createBasePlugins() : createSimplePlugins()),
		[variant],
	);
	const withoutToolbar = useMemo(
		() =>
			toolbarVisible
				? basePlugins
				: basePlugins.filter((p) => p.key !== "fixed-toolbar"),
		[basePlugins, toolbarVisible],
	);
	const resolvedPlugins = useMemo(
		() => overridePlugins ?? [...withoutToolbar, ...(extraPlugins ?? [])],
		[extraPlugins, overridePlugins, withoutToolbar],
	);

	const editor = usePlateEditor(
		{
			plugins: resolvedPlugins,
			value,
		},
		[resolvedPlugins],
	);

	return (
		<Plate
			editor={editor}
			onValueChange={onChange ? ({ value: v }) => onChange(v) : undefined}
			readOnly={readOnly}
		>
			<EditorContainer className={className}>
				<Editor
					variant={variant === "simple" ? "none" : "default"}
					placeholder={placeholder}
					autoFocus={autoFocus}
					className={editorClassName}
				/>
			</EditorContainer>
			{children}
		</Plate>
	);
}
