"use client";

import { useAction } from "convex/react";
import { useCallback, useRef, useState } from "react";
import type {
	AIActionResult,
	EmbeddedAIActionType,
	WhiteboardAIOptions,
} from "@/types/embedded-ai";
import { api } from "../../convex/_generated/api";

// ── Streaming State Hook ─────────────────────────────────────────────────
// Manages the text accumulation + streaming lifecycle for AIResponseInline.

interface UseStreamingTextReturn {
	/** The current accumulated text. */
	text: string;
	/** Whether the stream is currently active. */
	isStreaming: boolean;
	/** Start a new streaming session (clears previous text). */
	startStreaming: () => void;
	/** Append a text chunk to the accumulated text. */
	appendChunk: (chunk: string) => void;
	/** Finalize the stream (stops the cursor animation). */
	finalize: () => void;
	/** Reset all state (clears text + stops streaming). */
	reset: () => void;
}

export function useStreamingText(): UseStreamingTextReturn {
	const [text, setText] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	// Use a ref to accumulate text synchronously — avoids stale closure issues
	// when appendChunk is called rapidly.
	const textRef = useRef("");

	const startStreaming = useCallback(() => {
		textRef.current = "";
		setText("");
		setIsStreaming(true);
	}, []);

	const appendChunk = useCallback((chunk: string) => {
		textRef.current += chunk;
		setText(textRef.current);
	}, []);

	const finalize = useCallback(() => {
		setIsStreaming(false);
	}, []);

	const reset = useCallback(() => {
		textRef.current = "";
		setText("");
		setIsStreaming(false);
	}, []);

	return { text, isStreaming, startStreaming, appendChunk, finalize, reset };
}

// ── Embedded AI Action Hook ──────────────────────────────────────────────
// Calls the Convex embeddedAction dispatcher and manages result state.

interface EmbeddedAIArgs {
	type: EmbeddedAIActionType;
	context: {
		workspaceId: string;
		projectId?: string;
		documentId?: string;
		issueId?: string;
		whiteboardId?: string;
	};
	prompt?: string;
	selectedText?: string;
	targetLanguage?: string;
	whiteboard?: WhiteboardAIOptions;
}

interface UseEmbeddedAIReturn extends UseStreamingTextReturn {
	/** The result of the last completed action. */
	result: AIActionResult | null;
	/** Whether a Convex action call is in progress. */
	isLoading: boolean;
	/** Error message from the last failed action. */
	error: string | null;
	/** Call the embedded AI Convex action. */
	callEmbeddedAI: (args: EmbeddedAIArgs) => Promise<AIActionResult | null>;
}

export function useEmbeddedAI(): UseEmbeddedAIReturn {
	const { text, isStreaming, startStreaming, appendChunk, finalize, reset } =
		useStreamingText();
	const [result, setResult] = useState<AIActionResult | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const embeddedAction = useAction(api.ai.embedded.embeddedAction);

	const callEmbeddedAI: UseEmbeddedAIReturn["callEmbeddedAI"] = useCallback(
		async (args) => {
			setIsLoading(true);
			setError(null);
			setResult(null);
			startStreaming();

			try {
				const response = await embeddedAction({
					type: args.type,
					context: args.context as Parameters<
						typeof embeddedAction
					>[0]["context"],
					prompt: args.prompt,
					selectedText: args.selectedText,
					targetLanguage: args.targetLanguage,
					whiteboard: args.whiteboard as Parameters<
						typeof embeddedAction
					>[0]["whiteboard"],
				});

				const actionResult: AIActionResult = {
					type: response.type as EmbeddedAIActionType,
					text: response.text,
					data: response.data,
					error: response.error,
				};

				if (response.error) {
					setError(response.error);
					finalize();
					return actionResult;
				}

				// Set the full text at once (action returns complete text).
				// Real streaming via delta persistence is a future enhancement.
				appendChunk(response.text);
				finalize();

				setResult(actionResult);
				return actionResult;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(message);
				finalize();
				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[embeddedAction, startStreaming, appendChunk, finalize],
	);

	return {
		text,
		isStreaming,
		startStreaming,
		appendChunk,
		finalize,
		reset,
		result,
		isLoading,
		error,
		callEmbeddedAI,
	};
}
