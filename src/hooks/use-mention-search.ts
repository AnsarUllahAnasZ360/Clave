"use client";

import { useConvex } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── Types ────────────────────────────────────────────────────────────────

export type MentionEntityType = "user" | "issue" | "document" | "agent";

export interface MentionReference {
	entityType: MentionEntityType;
	entityId: string;
	displayName: string;
	/** Extra metadata for display: avatar URL, issue identifier, etc. */
	metadata?: Record<string, string>;
}

export interface MentionSearchResult {
	entityType: MentionEntityType;
	entityId: string;
	displayName: string;
	/** Secondary text (email for users, issue ID for issues, project for docs) */
	subtitle?: string;
	/** Avatar image URL (users only) */
	image?: string;
}

export interface UseMentionSearchReturn {
	results: MentionSearchResult[];
	isSearching: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;

/**
 * Debounced mention search across workspace members, issues, and documents.
 * Combines `mentions.search` (users + documents) with `issues.search`.
 */
export function useMentionSearch(
	workspaceId: Id<"workspaces">,
	query: string | null,
): UseMentionSearchReturn {
	const convex = useConvex();
	const [results, setResults] = useState<MentionSearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortRef = useRef(0);

	const search = useCallback(
		async (term: string, generation: number) => {
			setIsSearching(true);
			try {
				// Run both searches in parallel
				const [mentionResults, issueResults] = await Promise.all([
					convex.query(api.mentions.search, {
						workspaceId,
						term,
					}),
					term.trim()
						? convex.query(api.issues.search, {
								workspaceId,
								searchTerm: term,
							})
						: Promise.resolve([]),
				]);

				// Bail if a newer search has started
				if (generation !== abortRef.current) return;

				const items: MentionSearchResult[] = [];

				// Users
				for (const user of mentionResults.users) {
					items.push({
						entityType: "user",
						entityId: user.id,
						displayName: user.name,
						image: user.image,
					});
				}

				// Issues (take top 5)
				for (const issue of issueResults.slice(0, 5)) {
					items.push({
						entityType: "issue",
						entityId: issue._id,
						displayName: issue.title,
						subtitle: issue.identifier,
					});
				}

				// Documents
				for (const doc of mentionResults.documents) {
					items.push({
						entityType: "document",
						entityId: doc.id,
						displayName: doc.title,
					});
				}

				// Sub-agents
				if (mentionResults.agents) {
					for (const agent of mentionResults.agents) {
						items.push({
							entityType: "agent",
							entityId: agent.id,
							displayName: agent.name,
							subtitle: agent.description,
						});
					}
				}

				setResults(items);
			} catch {
				if (generation === abortRef.current) {
					setResults([]);
				}
			} finally {
				if (generation === abortRef.current) {
					setIsSearching(false);
				}
			}
		},
		[convex, workspaceId],
	);

	useEffect(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}

		if (query === null) {
			setResults([]);
			setIsSearching(false);
			return;
		}

		const generation = ++abortRef.current;
		setIsSearching(true);

		timerRef.current = setTimeout(() => {
			search(query, generation);
		}, DEBOUNCE_MS);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [query, search]);

	return useMemo(() => ({ results, isSearching }), [results, isSearching]);
}
