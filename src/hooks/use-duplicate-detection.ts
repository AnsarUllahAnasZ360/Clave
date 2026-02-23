"use client";

import { useConvex } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export interface DuplicateIssue {
	_id: string;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	projectId?: string;
}

const DEBOUNCE_MS = 600;
const MIN_CHARS = 10;
const MIN_WORDS = 3;
const MAX_RESULTS = 5;

function shouldSearch(title: string): boolean {
	const trimmed = title.trim();
	if (trimmed.length >= MIN_CHARS) return true;
	const words = trimmed.split(/\s+/).filter(Boolean);
	return words.length >= MIN_WORDS;
}

/**
 * Debounced hook that searches for similar existing issues based on title.
 * Uses Convex full-text search (issues.search) — no AI call needed.
 */
export function useDuplicateDetection(
	title: string,
	workspaceId: Id<"workspaces">,
) {
	const convex = useConvex();
	const [duplicates, setDuplicates] = useState<DuplicateIssue[]>([]);
	const [loading, setLoading] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortRef = useRef(0);

	const search = useCallback(
		async (searchTitle: string, generation: number) => {
			if (!shouldSearch(searchTitle)) {
				setDuplicates([]);
				setLoading(false);
				return;
			}

			setLoading(true);
			try {
				const results = await convex.query(api.issues.search, {
					workspaceId,
					searchTerm: searchTitle.trim(),
				});

				// Abort if a newer search has started
				if (abortRef.current !== generation) return;

				// Filter and map results
				type SearchResult = {
					_id: string;
					identifier: string;
					title: string;
					status: string;
					priority: string;
					projectId?: string;
				};
				const mapped: DuplicateIssue[] = (results as SearchResult[])
					.filter(
						(issue: SearchResult) =>
							// Exclude exact title matches (same title = likely the same issue being created)
							issue.title.toLowerCase() !== searchTitle.trim().toLowerCase(),
					)
					.slice(0, MAX_RESULTS)
					.map((issue: SearchResult) => ({
						_id: issue._id as string,
						identifier: issue.identifier,
						title: issue.title,
						status: issue.status,
						priority: issue.priority,
						projectId: issue.projectId as string | undefined,
					}));

				setDuplicates(mapped);
			} catch {
				// Silently fail — duplicate detection is informational
				setDuplicates([]);
			} finally {
				if (abortRef.current === generation) {
					setLoading(false);
				}
			}
		},
		[convex, workspaceId],
	);

	useEffect(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}

		if (!shouldSearch(title)) {
			setDuplicates([]);
			setLoading(false);
			return;
		}

		const generation = ++abortRef.current;
		timerRef.current = setTimeout(() => {
			search(title, generation);
		}, DEBOUNCE_MS);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [title, search]);

	return { duplicates, loading };
}
