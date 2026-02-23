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

		return members
			.filter((m) => m.user != null)
			.map((m) => ({
				key: m.user?._id,
				text: m.user?.name ?? m.user?.email ?? "Unknown",
				data: {
					userId: m.user?._id,
					avatarUrl: m.user?.avatarUrl ?? m.user?.image,
					email: m.user?.email,
					role: m.user?.role,
				},
			}));
	}, [members]);
}
