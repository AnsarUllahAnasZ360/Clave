"use client";

import { useConvex } from "convex/react";
import { useMemo } from "react";
import type { MentionItem } from "@/components/comments/MentionList";
import { createMentionSuggestion } from "@/components/comments/mention-suggestion";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ── AI mention item (injected client-side, not from backend) ────────────

const AI_MENTION_ITEM: MentionItem = {
	type: "ai",
	data: { id: "ai", name: "Clave AI" },
};

function matchesAI(query: string): boolean {
	if (!query) return true; // Show AI when query is empty (@ just typed)
	const q = query.toLowerCase();
	return (
		"ai".startsWith(q) || "clave".startsWith(q) || "clave ai".startsWith(q)
	);
}

/**
 * Hook that creates a TipTap mention suggestion config wired to the
 * Convex mentions.search query. Returns a stable config object.
 * Injects "Clave AI" as a mention option client-side.
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

				// Inject AI item at the top when query matches
				if (matchesAI(query)) {
					items.push(AI_MENTION_ITEM);
				}

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
