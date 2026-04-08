"use client";

import { useCallback, useState } from "react";
import { useEmbeddedAI } from "./use-embedded-ai";

interface UseDraftDescriptionReturn {
	/** Generated description text (markdown or plain text). */
	description: string | null;
	/** Whether the AI action is in progress. */
	loading: boolean;
	/** Error message from the last failed action. */
	error: string | null;
	/** Trigger the draft generation. Returns the generated text or null. */
	generateDraft: (args: {
		title: string;
		workspaceId: string;
		issueType?: string;
		priority?: string;
		issueId?: string;
		plainText?: boolean;
	}) => Promise<string | null>;
}

/**
 * Hook for generating issue descriptions via the embedded AI dispatcher.
 */
export function useDraftDescription(): UseDraftDescriptionReturn {
	const [description, setDescription] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { callEmbeddedAI } = useEmbeddedAI();

	const generateDraft: UseDraftDescriptionReturn["generateDraft"] = useCallback(
		async (args) => {
			setLoading(true);
			setError(null);
			setDescription(null);

			try {
				const result = await callEmbeddedAI({
					type: "issue_draft_description",
					context: {
						workspaceId: args.workspaceId,
						issueId: args.issueId,
					},
					prompt: args.title,
					plainText: args.plainText,
				});

				if (result?.error) {
					setError(result.error);
					return null;
				}

				const text = result?.text ?? null;
				setDescription(text);
				return text;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to generate draft";
				setError(message);
				return null;
			} finally {
				setLoading(false);
			}
		},
		[callEmbeddedAI],
	);

	return { description, loading, error, generateDraft };
}
