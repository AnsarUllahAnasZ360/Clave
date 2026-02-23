"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEmbeddedAI } from "./use-embedded-ai";

export interface TriageSuggestions {
	priority: string;
	type: string;
	labels: string[];
	reasoning: string;
	confidence?: number;
}

interface UseAutoTriageReturn {
	suggestions: TriageSuggestions | null;
	loading: boolean;
	dismissed: boolean;
	dismiss: () => void;
}

/**
 * Debounced auto-triage hook.
 * Fires when title has >= 5 characters after 800ms of inactivity.
 */
export function useAutoTriage(
	title: string,
	workspaceId: string | undefined,
): UseAutoTriageReturn {
	const [suggestions, setSuggestions] = useState<TriageSuggestions | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [dismissed, setDismissed] = useState(false);
	const { callEmbeddedAI } = useEmbeddedAI();
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastTitleRef = useRef("");

	const dismiss = useCallback(() => {
		setDismissed(true);
		setSuggestions(null);
	}, []);

	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		const trimmed = title.trim();

		// Hide if title is too short
		if (trimmed.length < 5 || !workspaceId) {
			setSuggestions(null);
			setLoading(false);
			return;
		}

		// Don't re-trigger for same title
		if (trimmed === lastTitleRef.current) return;

		// Reset dismissed state when title changes significantly
		if (dismissed) {
			setDismissed(false);
		}

		setLoading(true);

		debounceRef.current = setTimeout(async () => {
			lastTitleRef.current = trimmed;

			try {
				const result = await callEmbeddedAI({
					type: "issue_auto_triage",
					context: { workspaceId },
					prompt: trimmed,
				});

				if (result?.error) {
					setSuggestions(null);
					setLoading(false);
					return;
				}

				if (result?.data) {
					const data = result.data as Partial<TriageSuggestions>;
					setSuggestions({
						priority: data.priority ?? "medium",
						type: data.type ?? "issue",
						labels: data.labels ?? [],
						reasoning: data.reasoning ?? "",
						confidence: (data as { confidence?: number }).confidence,
					});
				} else {
					setSuggestions(null);
				}
			} catch {
				setSuggestions(null);
			} finally {
				setLoading(false);
			}
		}, 800);

		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [title, workspaceId, callEmbeddedAI, dismissed]);

	return { suggestions, loading, dismissed, dismiss };
}
