"use client";

import { useConvex } from "convex/react";
import { useMemo } from "react";
import type { MentionItem } from "@/components/comments/MentionList";
import {
	createMentionSuggestion,
	type MentionSuggestionOptions,
} from "@/components/comments/mention-suggestion";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Hook that creates a TipTap mention suggestion config wired to the
 * Convex mentions.search query. Returns a stable config object.
 */
export function useMentionSuggestion(workspaceId: Id<"workspaces">) {
	const convex = useConvex();

	const suggestion = useMemo(() => {
		const fetchItems = async (query: string): Promise<MentionItem[]> => {
			try {
				const results = await convex.query(api.mentions.search, {
					workspaceId,
					term: query,
				});

				const items: MentionItem[] = [];

				for (const user of results.users) {
					items.push({
						type: "user",
						data: user,
					});
				}
				for (const doc of results.documents) {
					items.push({
						type: "document",
						data: doc,
					});
				}
				for (const board of results.whiteboards) {
					items.push({
						type: "whiteboard",
						data: board,
					});
				}

				return items;
			} catch {
				return [];
			}
		};

		return createMentionSuggestion({ fetchItems });
	}, [convex, workspaceId]);

	return suggestion;
}
