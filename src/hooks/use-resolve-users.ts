"use client";

import type { User } from "@blocknote/core/comments";
import { useConvex } from "convex/react";
import { useCallback } from "react";
import { api } from "../../convex/_generated/api";

/**
 * React hook that returns a resolveUsers function compatible with
 * BlockNote's CommentsExtension. Fetches user data from Convex by ID array.
 */
export function useResolveUsers() {
	const convex = useConvex();

	return useCallback(
		async (userIds: string[]): Promise<User[]> => {
			if (userIds.length === 0) return [];
			const results = await convex.query(api.documentComments.resolveUsers, {
				userIds,
			});
			return (results ?? []).filter(Boolean) as User[];
		},
		[convex],
	);
}
