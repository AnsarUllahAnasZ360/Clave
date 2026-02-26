"use client";

/**
 * Thin adapter that connects global dictation to a specific Plate editor.
 *
 * Must be rendered inside a `<Plate>` context (via EditorAIBridge).
 *
 * Listens for:
 * - "clave:dictation-transcript" custom events (from GlobalDictationProvider)
 *   — matches by element reference captured at recording-start time
 * - "clave:dictation-toggle" with surface="document" (from slash command)
 *
 * Scopes activation to the editor that currently has focus.
 */

import { useEditorRef } from "platejs/react";
import { useCallback, useEffect, useRef } from "react";
import { useGlobalDictationOptional } from "@/components/providers/global-dictation-provider";

function getEditorRuntimeId(editor: { id?: unknown }): string | null {
	if (editor.id === null || editor.id === undefined) return null;
	return String(editor.id);
}

interface DictationBridgeProps {
	workspaceId: string;
}

export function DictationBridge({
	workspaceId: _workspaceId,
}: DictationBridgeProps) {
	const editor = useEditorRef();
	const editorElRef = useRef<HTMLElement | null>(null);
	const globalDictation = useGlobalDictationOptional();

	// Resolve the editor DOM node once
	useEffect(() => {
		try {
			const el = editor.api.toDOMNode(editor) as HTMLElement | undefined;
			editorElRef.current = el ?? null;
		} catch {
			editorElRef.current = null;
		}
	}, [editor]);

	// Check if this editor currently has focus
	const isOurEditor = useCallback(() => {
		const active = document.activeElement;
		const slateEl = active?.closest("[data-slate-editor]");
		return slateEl != null && slateEl === editorElRef.current;
	}, []);

	// Listen for transcript events from GlobalDictationProvider
	// The event includes `targetEditor` — the Slate editor element that had
	// focus when recording started. Match by element reference so it works
	// even after the editor lost focus during recording.
	useEffect(() => {
		function handleTranscript(event: Event) {
			const detail = (
				event as CustomEvent<{ text: string; targetEditor?: Element }>
			).detail;
			const { text, targetEditor } = detail;

			// Match by captured element reference
			if (targetEditor && editorElRef.current) {
				if (targetEditor !== editorElRef.current) return;
			} else {
				// Fallback: check current focus
				if (!isOurEditor()) return;
			}

			editor.tf.focus();
			editor.tf.insertText(text);
		}

		window.addEventListener("clave:dictation-transcript", handleTranscript);
		return () =>
			window.removeEventListener(
				"clave:dictation-transcript",
				handleTranscript,
			);
	}, [editor, isOurEditor]);

	// Listen for document-scoped dictation toggle (from slash command)
	useEffect(() => {
		if (!globalDictation) return;

		function handleDocumentToggle(event: Event) {
			const detail = (
				event as CustomEvent<{
					surface?: string;
					editorId?: string;
				}>
			).detail;
			if (detail?.surface !== "document") return;

			// Check editor ID match or focus match
			const currentEditorId = getEditorRuntimeId(editor);
			if (detail.editorId && currentEditorId) {
				if (detail.editorId !== currentEditorId) return;
			} else if (!isOurEditor()) {
				return;
			}

			globalDictation?.toggleDictation();
		}

		window.addEventListener("clave:dictation-toggle", handleDocumentToggle);
		return () =>
			window.removeEventListener(
				"clave:dictation-toggle",
				handleDocumentToggle,
			);
	}, [editor, globalDictation, isOurEditor]);

	return null;
}
