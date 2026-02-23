"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { api } from "../../../convex/_generated/api";

export interface MentionUserItem {
	key: string;
	text: string;
	data: {
		userId: string;
		avatarUrl?: string;
		email?: string;
		role?: string;
	};
}

/**
 * Hook that queries workspace members from Convex and returns them
 * in a format compatible with Plate's mention combobox.
 *
 * Uses workspace context to scope the query. Returns an empty array
 * when no workspace is available (e.g., share mode).
 */
export function useMentionUsers(): MentionUserItem[] {
	const workspace = useWorkspaceOptional();
	const members = useQuery(
		api.workspaceMembers.list,
		workspace ? { workspaceId: workspace.workspaceId } : "skip",
	);

	return useMemo(() => {
		if (!members) return [];

		const items: MentionUserItem[] = [];
		for (const member of members) {
			const user = member.user;
			if (!user) continue;
			items.push({
				key: String(user._id),
				text: user.name ?? user.email ?? "Unknown",
				data: {
					userId: String(user._id),
					avatarUrl: user.avatarUrl ?? user.image,
					email: user.email,
					role: user.role,
				},
			});
		}
		return items;
	}, [members]);
}
